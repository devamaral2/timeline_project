package app.braid.mobile.ui.taskedit

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.request.AgentRequestRepository
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.task.CreateTask
import app.braid.mobile.domain.task.InvalidInputException
import app.braid.mobile.domain.task.NewSeries
import app.braid.mobile.domain.task.RecurrenceDraft
import app.braid.mobile.domain.task.RecurrenceErrors
import app.braid.mobile.domain.task.RecurrenceRepository
import app.braid.mobile.domain.task.RecurrenceSeries
import app.braid.mobile.domain.task.SeriesNotFoundException
import app.braid.mobile.domain.task.SeriesPatch
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskDetailRepository
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.TaskDraftErrors
import app.braid.mobile.domain.task.TaskEditRepository
import app.braid.mobile.domain.task.TaskNotFoundException
import app.braid.mobile.domain.task.TaskPatch
import app.braid.mobile.domain.task.TaskPickerRepository
import app.braid.mobile.domain.task.TaskRecurrence
import app.braid.mobile.domain.task.addReminder
import app.braid.mobile.domain.task.addTag
import app.braid.mobile.domain.task.buildCreateTask
import app.braid.mobile.domain.task.buildNewSeries
import app.braid.mobile.domain.task.buildTaskPatch
import app.braid.mobile.domain.task.draftFromTask
import app.braid.mobile.domain.task.draftWithPickedArtifact
import app.braid.mobile.domain.task.emptyRecurrenceDraft
import app.braid.mobile.domain.task.emptyTaskDraft
import app.braid.mobile.domain.task.linkedTaskIds
import app.braid.mobile.domain.task.moveDraftArtifact
import app.braid.mobile.domain.task.normalizeTag
import app.braid.mobile.domain.task.planSeriesEdit
import app.braid.mobile.domain.task.rebaseDraft
import app.braid.mobile.domain.task.recurrenceDraftFromRule
import app.braid.mobile.domain.task.removeDraftArtifact
import app.braid.mobile.domain.task.removeReminder
import app.braid.mobile.domain.task.removeTag
import app.braid.mobile.domain.task.schedule
import app.braid.mobile.domain.task.scheduleAfterTask
import app.braid.mobile.domain.task.setCopyQuantity
import app.braid.mobile.domain.task.validateNewRecurrence
import app.braid.mobile.domain.task.validateSeriesEdit
import app.braid.mobile.domain.task.validateTaskDraft
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.taskartifacts.TaskArtifactPicker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.TimeZone
import java.util.UUID
import javax.inject.Inject

const val STALE_FORM_NOTICE = "Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira o que você digitou e salve de novo."
const val REFUSED_FORM_NOTICE = "A API recusou alguma entrada. Confira os campos e tente de novo."
const val FAILED_EDIT_NOTICE = "Não foi possível salvar a tarefa. Tente novamente."
const val FAILED_CREATE_NOTICE = "Não foi possível criar a tarefa. Tente novamente."
const val SERIES_GONE_NOTICE = "A série já não existe."
const val SERIES_FAILED_NOTICE = "Não foi possível carregar a recorrência."
const val SERIES_DELETE_FAILED_NOTICE = "Não foi possível apagar a série. Tente novamente."

private const val SUGGESTION_LIMIT = 6
private const val TAG_DELAY_MILLIS = 200L
private const val PLACE_DELAY_MILLIS = 300L
private const val PLACE_MIN_QUERY = 3
private const val KEY_IDEMPOTENCY = "idempotencyKey"

/** A série de uma ocorrência, como a seção "Recorrência" a lê. */
sealed interface SeriesLoad {
    /** A tarefa não é uma ocorrência: não há série para ler. */
    data object None : SeriesLoad

    data object Loading : SeriesLoad

    data class Ready(
        val series: RecurrenceSeries,
    ) : SeriesLoad

    /** A ocorrência ainda aponta para uma série que a API não tem mais (apagada). */
    data object Gone : SeriesLoad

    data object Failed : SeriesLoad
}

/**
 * A seção "Recorrência" do formulário, fora do [TaskDraft] como no web: a regra é outra chamada, com a revisão da série.
 * [draft] é `null` até a pessoa definir a regra (criação e tarefa avulsa); numa ocorrência começa na regra da série.
 * [occurrence] é a ocorrência que a tarefa lida é, `null` na criação e na tarefa avulsa.
 */
data class RecurrenceForm(
    val series: SeriesLoad = SeriesLoad.None,
    val draft: RecurrenceDraft? = null,
    val errors: RecurrenceErrors = emptyMap(),
    val occurrence: TaskRecurrence? = null,
    val deleting: Boolean = false,
    val deleteFailed: Boolean = false,
)

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
        val recurrence: RecurrenceForm = RecurrenceForm(),
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
        private val recurrences: RecurrenceRepository,
        private val clock: AppClock,
        picker: TaskPickerRepository,
        requests: AgentRequestRepository,
        session: SessionRepository,
        artifacts: ArtifactRepository,
    ) : ViewModel() {
        private val taskId: String? = savedState["taskId"]
        private val mutableState = MutableStateFlow<TaskEditUiState>(TaskEditUiState.Loading)
        val state: StateFlow<TaskEditUiState> = mutableState.asStateFlow()

        /** A tarefa como a última leitura a trouxe: a base do que mudou. `null` na criação. */
        private var loaded: TaskDetail? = null

        /** Uma gravação por vez; vale antes da próxima atualização do estado, então dois toques não mandam duas. */
        private var busy = false

        /** O corpo da última criação enviada (tarefa ou série): só uma entrada diferente pede chave nova. */
        private var lastCreate: Any? = null
        private var tagJob: Job? = null
        private var placeJob: Job? = null

        /** A tarefa principal e as subtarefas (ticket 15): só a edição as tem. */
        val hierarchy =
            TaskHierarchyEditor(
                scope = viewModelScope,
                taskId = taskId,
                draft = { (mutableState.value as? TaskEditUiState.Form)?.draft ?: emptyTaskDraft() },
                updateDraft = { transform -> update(transform) },
                details = details,
                edits = edits,
                picker = picker,
                requests = requests,
                session = session,
                clock = clock,
            )

        /** O seletor de artefatos da tarefa (ticket 16): a escolha entra no rascunho, a gravação fica para o Salvar. */
        val artifactPicker = TaskArtifactPicker(viewModelScope, artifacts)

        init {
            viewModelScope.launch {
                mutableState
                    .map { (it as? TaskEditUiState.Form)?.draft?.let(::linkedTaskIds).orEmpty() }
                    .distinctUntilChanged()
                    .collect(hierarchy::sync)
            }
            if (taskId == null) {
                mutableState.value = TaskEditUiState.Form(taskId = null, draft = emptyTaskDraft(savedState["name"] ?: ""))
            } else {
                load(taskId)
            }
        }

        /** O "+" da seção Artefatos: abre o seletor da fonte do tipo que o rascunho tem agora. */
        fun openArtifactPicker() {
            val draft = (mutableState.value as? TaskEditUiState.Form)?.draft ?: return
            artifactPicker.open(draft.kind, draft.artifacts.map { it.id }) { artifact ->
                update { it.copy(artifacts = draftWithPickedArtifact(it.artifacts, it.kind, artifact, UUID.randomUUID().toString())) }
            }
        }

        fun setArtifactQuantity(
            key: String,
            quantity: String,
        ) = update { it.copy(artifacts = setCopyQuantity(it.artifacts, key, quantity)) }

        fun removeArtifact(id: String) = update { it.copy(artifacts = removeDraftArtifact(it.artifacts, id)) }

        fun moveArtifact(
            id: String,
            step: Int,
        ) = update { it.copy(artifacts = moveDraftArtifact(it.artifacts, id, step)) }

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
                        mutableState.value =
                            TaskEditUiState.Form(
                                taskId = id,
                                draft = draftFromTask(task),
                                recurrence =
                                    RecurrenceForm(
                                        series =
                                            if (task.recurrence !=
                                                null
                                            ) {
                                                SeriesLoad.Loading
                                            } else {
                                                SeriesLoad.None
                                            },
                                        occurrence = task.recurrence,
                                    ),
                            )
                        task.recurrence?.let { loadSeries(it.id) }
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

        /** A regra que a pessoa está montando: a atualização vale só com o formulário aberto e a regra definida. */
        private fun updateRecurrence(transform: (RecurrenceForm) -> RecurrenceForm) =
            updateForm { it.copy(recurrence = transform(it.recurrence)) }

        /** "Definir a regra": começa semanal, no dia da semana e do mês do início do formulário. */
        fun defineRecurrence() =
            updateForm { it.copy(recurrence = it.recurrence.copy(draft = emptyRecurrenceDraft(it.draft.startDate), errors = emptyMap())) }

        /** Troca um campo da regra; cada controle do editor escreve o seu por aqui. */
        fun changeRecurrence(transform: (RecurrenceDraft) -> RecurrenceDraft) =
            updateRecurrence { it.copy(draft = it.draft?.let(transform)) }

        /** "Não repetir": a tarefa avulsa ou a criação volta a não ter regra. */
        fun clearRecurrence() = updateRecurrence { it.copy(draft = null, errors = emptyMap()) }

        /** "Cancelar troca": a regra volta à da série lida. */
        fun resetRecurrence() =
            updateRecurrence { form ->
                val series = (form.series as? SeriesLoad.Ready)?.series
                form.copy(draft = series?.let { recurrenceDraftFromRule(it.rule) } ?: form.draft, errors = emptyMap())
            }

        private fun loadSeries(
            seriesId: String,
            keepDraft: Boolean = false,
        ) {
            viewModelScope.launch {
                try {
                    val series = recurrences.series(seriesId)
                    updateRecurrence {
                        it.copy(
                            series = SeriesLoad.Ready(series),
                            draft =
                                if (keepDraft) {
                                    it.draft ?: recurrenceDraftFromRule(
                                        series.rule,
                                    )
                                } else {
                                    recurrenceDraftFromRule(series.rule)
                                },
                        )
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (gone: SeriesNotFoundException) {
                    updateRecurrence { it.copy(series = SeriesLoad.Gone) }
                } catch (failure: Exception) {
                    // Numa releitura a versão da tela fica; o Salvar seguinte avisa de novo. Na primeira, a linha avisa.
                    if (!keepDraft) updateRecurrence { it.copy(series = SeriesLoad.Failed) }
                }
            }
        }

        /** "Apagar a série" (já confirmado): apaga, e então relê a tarefa e a série, que passa a não existir. */
        fun deleteSeries() {
            val id = ((mutableState.value as? TaskEditUiState.Form)?.recurrence?.series as? SeriesLoad.Ready)?.series?.id ?: return
            val taskId = taskId ?: return
            updateRecurrence { it.copy(deleting = true, deleteFailed = false) }
            viewModelScope.launch {
                try {
                    recurrences.delete(id)
                    updateRecurrence { it.copy(deleting = false) }
                    val base = loaded
                    val next = base?.let { readAgain(taskId) }
                    if (next != null && base != null) {
                        loaded = next
                        updateForm { it.copy(draft = rebaseDraft(it.draft, base, next)) }
                    }
                    val occurrence = (next ?: base)?.recurrence
                    updateRecurrence {
                        if (occurrence == null) RecurrenceForm() else it.copy(occurrence = occurrence, series = SeriesLoad.Gone)
                    }
                    if (occurrence != null) loadSeries(occurrence.id, keepDraft = true)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    updateRecurrence { it.copy(deleting = false, deleteFailed = true) }
                }
            }
        }

        /** Salvar: confere o rascunho e a regra, e então cria ou grava só o que mudou. */
        fun save() {
            val form = mutableState.value as? TaskEditUiState.Form ?: return
            if (busy) return
            val base = loaded
            val problems = validateTaskDraft(form.draft)
            // Sem série (a criação, ou uma tarefa avulsa que vai virar recorrente) Salvar cria a série; a tarefa avulsa
            // fica como está e a série começa no dia seguinte. Com série, vale a troca da regra; a persistente não se repete.
            val joining = base != null && base.recurrence == null
            val schedule = if (joining) scheduleAfterTask(form.draft.schedule()) else form.draft.schedule()
            val rule = form.recurrence.draft?.takeUnless { form.draft.longRunning }
            val series = (form.recurrence.series as? SeriesLoad.Ready)?.series
            val startsSeries = (form.taskId == null || joining) && rule != null
            val ruleProblems =
                when {
                    rule == null -> emptyMap()
                    startsSeries -> validateNewRecurrence(rule, schedule)
                    series != null -> validateSeriesEdit(series, rule)
                    else -> emptyMap()
                }
            updateForm { it.copy(errors = problems, recurrence = it.recurrence.copy(errors = ruleProblems)) }
            if (problems.isNotEmpty() || ruleProblems.isNotEmpty()) return
            val newSeries = if (startsSeries && rule != null) buildNewSeries(rule, form.draft, TimeZone.getDefault().id, schedule) else null
            val now = clock.now()
            if (form.taskId == null) {
                if (newSeries != null) createSeries(newSeries) else create(buildCreateTask(form.draft, now))
            } else if (base != null) {
                val patch = buildTaskPatch(base, form.draft, now)
                val seriesPatch = if (!startsSeries && rule != null && series != null) planSeriesEdit(series, rule) else null
                if (patch == null && seriesPatch == null && newSeries == null) {
                    updateForm { it.copy(done = true) }
                } else {
                    edit(form.taskId, base, patch, series?.id, seriesPatch, newSeries)
                }
            }
        }

        /** A chave do rascunho: a mesma enquanto o corpo for o mesmo, e nova quando ele muda depois de uma falha. */
        private fun idempotencyKeyFor(body: Any): String {
            // Corpo novo depois de uma falha pede chave nova, senão a API recusa a chave reaproveitada com outro corpo (422).
            if (lastCreate != null && lastCreate != body) savedState[KEY_IDEMPOTENCY] = UUID.randomUUID().toString()
            lastCreate = body
            return savedState[KEY_IDEMPOTENCY] ?: UUID.randomUUID().toString().also { savedState[KEY_IDEMPOTENCY] = it }
        }

        private fun create(task: CreateTask) {
            busy = true
            updateForm { it.copy(saving = true, failure = null) }
            // A mesma chave enquanto o corpo for o mesmo: tocar em Salvar de novo não cria outra tarefa.
            val key = idempotencyKeyFor(task)
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

        /** Criar com recorrência cria a série no lugar da tarefa: nada vai para `POST /api/tasks`. */
        private fun createSeries(series: NewSeries) {
            busy = true
            updateForm { it.copy(saving = true, failure = null) }
            val key = idempotencyKeyFor(series)
            viewModelScope.launch {
                try {
                    recurrences.create(series, key)
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

        /**
         * Grava a edição: a série nova primeiro, para uma regra recusada deixar a tarefa como estava, depois a troca da
         * regra da série e por fim a tarefa. Revisão velha em qualquer uma relê a tarefa e a série.
         */
        private fun edit(
            id: String,
            base: TaskDetail,
            patch: TaskPatch?,
            seriesId: String?,
            seriesPatch: SeriesPatch?,
            newSeries: NewSeries?,
        ) {
            busy = true
            updateForm { it.copy(saving = true, failure = null) }
            // A mesma chave a cada toque em Salvar: se a série saiu e a tarefa não, a nova tentativa não cria uma segunda.
            val key = newSeries?.let(::idempotencyKeyFor)
            viewModelScope.launch {
                try {
                    if (newSeries != null && key != null) recurrences.create(newSeries, key)
                    if (seriesPatch != null && seriesId != null) recurrences.update(seriesId, seriesPatch)
                    if (patch != null) edits.update(id, patch)
                    updateForm { it.copy(saving = false, done = true) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (stale: StaleRevisionException) {
                    reloadAfterConflict(id, base, base.recurrence?.id)
                } catch (refused: InvalidInputException) {
                    fail(REFUSED_FORM_NOTICE)
                } catch (failure: Exception) {
                    fail(FAILED_EDIT_NOTICE)
                }
            }
        }

        private suspend fun readAgain(id: String): TaskDetail? =
            try {
                details.task(id)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                null
            }

        /** Revisão velha: relê a tarefa e a série, mantém o que foi digitado e avisa. Se a leitura falhar, fica o que há na tela. */
        private suspend fun reloadAfterConflict(
            id: String,
            previous: TaskDetail,
            seriesId: String?,
        ) {
            val next = readAgain(id)
            if (next != null) loaded = next
            updateForm {
                it.copy(
                    draft = if (next != null) rebaseDraft(it.draft, previous, next) else it.draft,
                    recurrence = if (next != null) it.recurrence.copy(occurrence = next.recurrence) else it.recurrence,
                    failure = STALE_FORM_NOTICE,
                    saving = false,
                )
            }
            (next?.recurrence?.id ?: seriesId)?.let { loadSeries(it, keepDraft = true) }
            busy = false
        }

        private fun fail(message: String) {
            updateForm { it.copy(saving = false, failure = message) }
            busy = false
        }
    }
