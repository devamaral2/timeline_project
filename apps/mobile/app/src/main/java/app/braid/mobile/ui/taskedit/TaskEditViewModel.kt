package app.braid.mobile.ui.taskedit

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.task.CreateTask
import app.braid.mobile.domain.task.InvalidInputException
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskDetailRepository
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.TaskDraftErrors
import app.braid.mobile.domain.task.TaskEditRepository
import app.braid.mobile.domain.task.TaskNotFoundException
import app.braid.mobile.domain.task.TaskPatch
import app.braid.mobile.domain.task.addReminder
import app.braid.mobile.domain.task.addTag
import app.braid.mobile.domain.task.buildCreateTask
import app.braid.mobile.domain.task.buildTaskPatch
import app.braid.mobile.domain.task.draftFromTask
import app.braid.mobile.domain.task.emptyTaskDraft
import app.braid.mobile.domain.task.normalizeTag
import app.braid.mobile.domain.task.rebaseDraft
import app.braid.mobile.domain.task.removeReminder
import app.braid.mobile.domain.task.removeTag
import app.braid.mobile.domain.task.validateTaskDraft
import app.braid.mobile.domain.time.AppClock
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

const val STALE_FORM_NOTICE = "Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira o que você digitou e salve de novo."
const val REFUSED_FORM_NOTICE = "A API recusou alguma entrada. Confira os campos e tente de novo."
const val FAILED_EDIT_NOTICE = "Não foi possível salvar a tarefa. Tente novamente."
const val FAILED_CREATE_NOTICE = "Não foi possível criar a tarefa. Tente novamente."

private const val SUGGESTION_LIMIT = 6
private const val TAG_DELAY_MILLIS = 200L
private const val PLACE_DELAY_MILLIS = 300L
private const val PLACE_MIN_QUERY = 3
private const val KEY_IDEMPOTENCY = "idempotencyKey"

sealed interface TaskEditUiState {
    data object Loading : TaskEditUiState

    /** 404 e 403: "Tarefa não encontrada." */
    data object Missing : TaskEditUiState

    data object Failed : TaskEditUiState

    /** A tarefa de agente não se edita aqui. */
    data object AgentTask : TaskEditUiState

    /**
     * O formulário aberto: [taskId] é `null` na criação. [errors] são as recusas da própria tela, por campo; [failure]
     * é o aviso geral de quem não conseguiu gravar. [done] manda a tela voltar (salvou, ou não havia o que salvar).
     */
    data class Form(
        val taskId: String?,
        val draft: TaskDraft,
        val errors: TaskDraftErrors = emptyMap(),
        val saving: Boolean = false,
        val failure: String? = null,
        val done: Boolean = false,
        val tagSuggestions: List<String> = emptyList(),
        val placeSuggestions: List<String> = emptyList(),
    ) : TaskEditUiState
}

/**
 * O formulário de criar e de editar a tarefa de pessoa. Na criação (`taskId` ausente) o rascunho começa vazio, com o
 * `name` do `/tarefa comprar pão`; Salvar manda `POST /api/tasks` com a `Idempotency-Key` do rascunho. Na edição lê a
 * tarefa e Salvar manda `PATCH /api/tasks/{id}` só com o que mudou e a revisão lida; o conflito relê, rebaseia o que
 * foi digitado e avisa.
 */
@HiltViewModel
class TaskEditViewModel
    @Inject
    constructor(
        private val savedState: SavedStateHandle,
        private val details: TaskDetailRepository,
        private val edits: TaskEditRepository,
        private val clock: AppClock,
    ) : ViewModel() {
        private val taskId: String? = savedState["taskId"]
        private val mutableState = MutableStateFlow<TaskEditUiState>(TaskEditUiState.Loading)
        val state: StateFlow<TaskEditUiState> = mutableState.asStateFlow()

        /** A tarefa como a última leitura a trouxe: a base do que mudou. `null` na criação. */
        private var loaded: TaskDetail? = null

        /** Uma gravação por vez; vale antes da próxima atualização do estado, então dois toques não mandam duas. */
        private var busy = false

        /** O corpo da última criação enviada: só uma entrada diferente pede chave nova. */
        private var lastCreate: CreateTask? = null
        private var tagJob: Job? = null
        private var placeJob: Job? = null

        init {
            if (taskId == null) {
                mutableState.value = TaskEditUiState.Form(taskId = null, draft = emptyTaskDraft(savedState["name"] ?: ""))
            } else {
                load(taskId)
            }
        }

        fun retry() {
            taskId?.let(::load)
        }

        private fun load(id: String) {
            mutableState.value = TaskEditUiState.Loading
            viewModelScope.launch {
                try {
                    val task = details.task(id)
                    if (task.actor == TaskActor.Agent) {
                        mutableState.value = TaskEditUiState.AgentTask
                    } else {
                        loaded = task
                        mutableState.value = TaskEditUiState.Form(taskId = id, draft = draftFromTask(task))
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (missing: TaskNotFoundException) {
                    mutableState.value = TaskEditUiState.Missing
                } catch (failure: Exception) {
                    mutableState.value = TaskEditUiState.Failed
                }
            }
        }

        private fun updateForm(transform: (TaskEditUiState.Form) -> TaskEditUiState.Form) =
            mutableState.update { (it as? TaskEditUiState.Form)?.let(transform) ?: it }

        /** Troca o rascunho; cada seção escreve os seus campos por aqui. */
        fun update(transform: (TaskDraft) -> TaskDraft) = updateForm { it.copy(draft = transform(it.draft)) }

        fun addReminder(minutes: Int) = update { it.copy(reminders = addReminder(it.reminders, minutes)) }

        fun removeReminder(minutes: Int) = update { it.copy(reminders = removeReminder(it.reminders, minutes)) }

        /** Confirma a tag digitada (ou a sugestão escolhida); vazia ou repetida não entra. */
        fun commitTag(raw: String) {
            update { it.copy(tags = addTag(it.tags, raw)) }
            suggestTags("")
        }

        fun removeTag(tag: String) = update { it.copy(tags = removeTag(it.tags, tag)) }

        /** O texto do campo "Nova tag" mudou: 200 ms depois da última tecla, a API sugere tags que começam com ele. */
        fun suggestTags(text: String) {
            tagJob?.cancel()
            val query = normalizeTag(text)
            if (query.isEmpty()) {
                updateForm { it.copy(tagSuggestions = emptyList()) }
                return
            }
            tagJob =
                viewModelScope.launch {
                    delay(TAG_DELAY_MILLIS)
                    val names =
                        try {
                            edits.tagSuggestions(query, SUGGESTION_LIMIT)
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (failure: Exception) {
                            // Uma falha de sugestão não aparece: quem não a usa termina a tag na mão.
                            emptyList()
                        }
                    updateForm { it.copy(tagSuggestions = names.filter { name -> name.startsWith(query) }) }
                }
        }

        /** O texto do campo "Local" mudou: com 3 letras ou mais, 300 ms depois da última tecla a API sugere lugares. */
        fun typeLocation(text: String) {
            update { it.copy(location = text) }
            placeJob?.cancel()
            val query = text.trim()
            if (query.length < PLACE_MIN_QUERY) {
                updateForm { it.copy(placeSuggestions = emptyList()) }
                return
            }
            placeJob =
                viewModelScope.launch {
                    delay(PLACE_DELAY_MILLIS)
                    val labels =
                        try {
                            edits.placeSuggestions(query, SUGGESTION_LIMIT)
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (failure: Exception) {
                            emptyList()
                        }
                    updateForm { it.copy(placeSuggestions = labels) }
                }
        }

        /** Escolher uma sugestão grava o endereço inteiro no campo, sem pedir outra busca. */
        fun choosePlace(label: String) {
            placeJob?.cancel()
            updateForm { it.copy(draft = it.draft.copy(location = label), placeSuggestions = emptyList()) }
        }

        fun dismissPlaces() = updateForm { it.copy(placeSuggestions = emptyList()) }

        /** Salvar: confere o rascunho, e então cria ou grava só o que mudou. */
        fun save() {
            val form = mutableState.value as? TaskEditUiState.Form ?: return
            if (busy) return
            val problems = validateTaskDraft(form.draft)
            updateForm { it.copy(errors = problems) }
            if (problems.isNotEmpty()) return
            val base = loaded
            val now = clock.now()
            if (form.taskId == null) {
                create(buildCreateTask(form.draft, now))
            } else if (base != null) {
                val patch = buildTaskPatch(base, form.draft, now)
                if (patch == null) updateForm { it.copy(done = true) } else edit(form.taskId, base, patch)
            }
        }

        private fun create(task: CreateTask) {
            busy = true
            updateForm { it.copy(saving = true, failure = null) }
            // A mesma chave enquanto o corpo for o mesmo: tocar em Salvar de novo não cria outra tarefa. Corpo novo
            // depois de uma falha pede chave nova, senão a API recusa a chave reaproveitada com outro corpo (422).
            if (lastCreate != null && lastCreate != task) savedState[KEY_IDEMPOTENCY] = UUID.randomUUID().toString()
            lastCreate = task
            val key: String = savedState[KEY_IDEMPOTENCY] ?: UUID.randomUUID().toString().also { savedState[KEY_IDEMPOTENCY] = it }
            viewModelScope.launch {
                try {
                    edits.create(task, key)
                    updateForm { it.copy(saving = false, done = true) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (refused: InvalidInputException) {
                    fail(REFUSED_FORM_NOTICE)
                } catch (failure: Exception) {
                    fail(FAILED_CREATE_NOTICE)
                }
            }
        }

        private fun edit(
            id: String,
            base: TaskDetail,
            patch: TaskPatch,
        ) {
            busy = true
            updateForm { it.copy(saving = true, failure = null) }
            viewModelScope.launch {
                try {
                    edits.update(id, patch)
                    updateForm { it.copy(saving = false, done = true) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (stale: StaleRevisionException) {
                    reloadAfterConflict(id, base)
                } catch (refused: InvalidInputException) {
                    fail(REFUSED_FORM_NOTICE)
                } catch (failure: Exception) {
                    fail(FAILED_EDIT_NOTICE)
                }
            }
        }

        /** Revisão velha: relê a tarefa, mantém o que foi digitado e avisa. Se a leitura falhar, fica o que há na tela. */
        private suspend fun reloadAfterConflict(
            id: String,
            previous: TaskDetail,
        ) {
            val next =
                try {
                    details.task(id)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    null
                }
            if (next != null) loaded = next
            updateForm {
                it.copy(
                    draft = if (next != null) rebaseDraft(it.draft, previous, next) else it.draft,
                    failure = STALE_FORM_NOTICE,
                    saving = false,
                )
            }
            busy = false
        }

        private fun fail(message: String) {
            updateForm { it.copy(saving = false, failure = message) }
            busy = false
        }
    }
