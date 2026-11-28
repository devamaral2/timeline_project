package app.braid.mobile.ui.documents

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactDraft
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.TextContent
import app.braid.mobile.domain.artifact.TextData
import app.braid.mobile.domain.artifact.isFreeText
import app.braid.mobile.domain.task.HumanTaskSearch
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskEditRepository
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.normalizeTag
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.picker.EntityPickerController
import app.braid.mobile.ui.picker.EntityPickerState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

/** O que o formulário de criação cria: a nota de texto ou o alimento, com o tipo do contrato que o rótulo mostra. */
enum class NewDocumentKind(
    val label: String,
    val type: ArtifactType,
) {
    Text("Nota", ArtifactType.Text),
    Meal("Alimento", ArtifactType.Food),
}

/** Uma tarefa de pessoa ligada ao artefato, com o que a linha mostra. [relation] só existe na ligação já gravada. */
data class LinkedTask(
    val taskId: String,
    val name: String,
    val kind: TaskKind,
    val startedAt: Instant?,
    val relation: String? = null,
)

/** Como o editor de markdown mostra o texto: a fonte ou a leitura (o modo dividido é só de desktop). */
enum class EditorMode(
    val label: String,
) {
    Write("Escrever"),
    Read("Visualizar"),
}

const val STALE_TEXT_MESSAGE =
    "Esta nota mudou em outro lugar. Atualizamos a revisão; o que você digitou continua aqui. Confira e salve de novo."
const val EDIT_TEXT_FAILED = "Não foi possível salvar a nota. Tente novamente."
const val CREATE_TEXT_FAILED = "Não foi possível criar a nota. Tente novamente."
const val CREATE_MEAL_FAILED = "Não foi possível criar o alimento. Tente novamente."
const val EMPTY_MEAL_MESSAGE = "Escreva o que você comeu."
const val EMPTY_TEXT_MESSAGE = "Escreva o texto da nota."
const val TASK_LINK_SEARCH_FAILED = "Não foi possível buscar tarefas. Tente de novo."

/** Quantas tags a API sugere e quanto esperar depois da última tecla, como o web (`EditTagSection`). */
private const val TAG_SUGGESTION_LIMIT = 6
private const val TAG_SUGGESTION_DELAY_MILLIS = 200L

sealed interface DocumentEditUiState {
    data object Loading : DocumentEditUiState

    data object Failed : DocumentEditUiState

    /** Só a nota de texto própria se edita aqui: a de outro tipo, ou a global, não. */
    data object NotEditable : DocumentEditUiState

    data class Form(
        /** Editando um artefato que já existe; senão é a criação. */
        val existing: Boolean,
        val kind: NewDocumentKind = NewDocumentKind.Text,
        val name: String = "",
        val body: String = "",
        val meal: String = "",
        val tags: List<String> = emptyList(),
        /** O que está digitado no campo "Nova tag" e ainda não virou chip. */
        val tagText: String = "",
        /** As tags do usuário que começam com o texto do campo "Nova tag" (`GET /api/tags`), sem as já escolhidas. */
        val tagSuggestions: List<String> = emptyList(),
        val mode: EditorMode = EditorMode.Write,
        /** As tarefas de pessoa ligadas ao artefato, na ordem em que entraram. */
        val tasks: List<LinkedTask> = emptyList(),
        /** A folha de seleção de tarefas aberta, com a busca; nula, fechada. */
        val taskPicker: EntityPickerState<TaskCard>? = null,
        /** O tipo do artefato aberto para edição (o rótulo mostra o ícone e o código dele); na criação vale o de [kind]. */
        val editedType: ArtifactType = ArtifactType.Text,
        /** O código do tipo como a API o escreveu (um tipo que o app não conhece mostra o próprio código). */
        val editedTypeCode: String = editedType.code,
        /** O instante das linhas ("hoje, 09:00"): o relógio do app ao abrir o formulário. */
        val now: Instant = Instant.EPOCH,
        val saving: Boolean = false,
        val error: String? = null,
        /** O id do artefato salvo ou criado: a tela abre a leitura dele. */
        val savedId: String? = null,
    ) : DocumentEditUiState {
        /** O alimento só existe na criação e vai só com o texto do que foi comido. */
        val isMeal: Boolean get() = !existing && kind == NewDocumentKind.Meal

        /** O tipo que o rótulo do resumo mostra: o do artefato editado ou, na criação, o da escolha. */
        val shownType: ArtifactType get() = if (existing) editedType else kind.type

        val shownTypeCode: String get() = if (existing) editedTypeCode else kind.type.code
    }
}

/**
 * O formulário do artefato, na criação (`/nota` do chat) e na edição da nota de texto. A criação guarda uma chave de
 * idempotência por tipo enquanto o formulário está aberto; a edição manda a revisão lida e o conteúdo inteiro.
 */
@HiltViewModel
class DocumentEditViewModel
    @Inject
    constructor(
        savedState: SavedStateHandle,
        private val artifacts: ArtifactRepository,
        private val humanTasks: HumanTaskSearch,
        private val edits: TaskEditRepository,
        private val clock: AppClock,
    ) : ViewModel(),
        DocumentEditActions {
        private val documentId: String? = savedState["documentId"]
        private val mutableState =
            MutableStateFlow<DocumentEditUiState>(
                if (documentId == null) {
                    DocumentEditUiState.Form(existing = false, name = savedState.get<String>("name").orEmpty(), now = clock.now())
                } else {
                    DocumentEditUiState.Loading
                },
            )
        val state: StateFlow<DocumentEditUiState> = mutableState.asStateFlow()

        // Uma chave por tipo: trocar de Nota para Alimento e voltar não reaproveita a chave de outro corpo.
        private val idempotencyKeys = NewDocumentKind.entries.associateWith { UUID.randomUUID().toString() }.toMutableMap()

        // O último corpo enviado de cada tipo: corpo novo depois de uma falha pede chave nova, senão a API recusa a chave
        // reaproveitada com outro corpo (422), como no formulário de tarefa.
        private val lastBodies = mutableMapOf<NewDocumentKind, Pair<ArtifactDraft, List<String>?>>()
        private var revision = 0

        // As tarefas que já estavam ligadas: a lista só vai no corpo quando muda (na criação, quando há alguma).
        private var initialTaskIds: List<String> = emptyList()
        private var picker: EntityPickerController<TaskCard>? = null
        private var pickerJob: Job? = null
        private var tagJob: Job? = null

        // O tipo do artefato aberto para edição: o texto novo é gravado nele.
        private var type = ArtifactType.Text

        // A guarda vale antes da próxima emissão do estado: dois toques seguidos não mandam duas requisições.
        private var busy = false

        init {
            if (documentId != null) load(documentId)
        }

        override fun retry() {
            if (documentId == null) return
            mutableState.value = DocumentEditUiState.Loading
            load(documentId)
        }

        private fun load(id: String) {
            viewModelScope.launch {
                try {
                    val artifact = artifacts.get(id)
                    mutableState.value = if (artifact.editable) form(artifact) else DocumentEditUiState.NotEditable
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    mutableState.value = DocumentEditUiState.Failed
                }
            }
        }

        private val Artifact.editable: Boolean get() = type.isFreeText && !global && data is TextData

        private fun form(artifact: Artifact): DocumentEditUiState.Form {
            revision = artifact.revision
            type = artifact.type
            // Só as tarefas de pessoa entram: os pedidos ao agente que tocaram o artefato não se editam por aqui.
            val tasks =
                artifact.tasks
                    .filter { it.actor == TaskActor.Human }
                    .map { LinkedTask(it.taskId, it.name, it.kind, it.startedAt, it.relation) }
            initialTaskIds = tasks.map { it.taskId }
            return DocumentEditUiState.Form(
                existing = true,
                name = artifact.name,
                body = (artifact.data as TextData).body,
                tags = artifact.tags,
                tasks = tasks,
                editedType = artifact.type,
                editedTypeCode = artifact.typeCode,
                now = clock.now(),
            )
        }

        private fun edit(transform: (DocumentEditUiState.Form) -> DocumentEditUiState.Form) =
            mutableState.update { (it as? DocumentEditUiState.Form)?.let(transform) ?: it }

        override fun selectKind(kind: NewDocumentKind) = edit { it.copy(kind = kind, error = null) }

        override fun setName(name: String) = edit { it.copy(name = name) }

        override fun setBody(body: String) = edit { it.copy(body = body) }

        override fun setMeal(meal: String) = edit { it.copy(meal = meal) }

        override fun setMode(mode: EditorMode) = edit { it.copy(mode = mode) }

        /** O campo "Nova tag" mudou: 200 ms depois da última tecla, a API sugere tags que começam com ele. */
        override fun setTagText(text: String) {
            edit { it.copy(tagText = text) }
            suggestTags(text)
        }

        /** Confirma o que está no campo "Nova tag": minúsculo, aparado, sem repetir e sem vazio. */
        override fun commitTag() {
            edit { it.copy(tags = it.tags.withTag(it.tagText), tagText = "") }
            suggestTags("")
        }

        /** Escolher uma sugestão a confirma no lugar do que estava digitado. */
        override fun pickTagSuggestion(name: String) {
            edit { it.copy(tags = it.tags.withTag(name), tagText = "") }
            suggestTags("")
        }

        private fun suggestTags(text: String) {
            tagJob?.cancel()
            val query = normalizeTag(text)
            if (query.isEmpty()) {
                edit { it.copy(tagSuggestions = emptyList()) }
                return
            }
            tagJob =
                viewModelScope.launch {
                    delay(TAG_SUGGESTION_DELAY_MILLIS)
                    val names =
                        try {
                            edits.tagSuggestions(query, TAG_SUGGESTION_LIMIT)
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (failure: Exception) {
                            // Uma falha de sugestão não aparece: quem não a usa termina a tag na mão.
                            emptyList()
                        }
                    // A resposta pode chegar para um texto que já mudou: só fica o que começa com o texto atual.
                    edit { form -> form.copy(tagSuggestions = names.filter { it.startsWith(query) && it !in form.tags }) }
                }
        }

        /** O "+" da seção Tarefas: abre a folha buscando as primeiras tarefas de pessoa, sem as já ligadas. */
        override fun openTaskPicker() {
            closeTaskPicker()
            val linked =
                (mutableState.value as? DocumentEditUiState.Form)
                    ?.tasks
                    .orEmpty()
                    .map { it.taskId }
                    .toSet()
            val next = EntityPickerController(viewModelScope, search = humanTasks::search, keep = { it.id !in linked })
            picker = next
            edit { it.copy(taskPicker = EntityPickerState()) }
            pickerJob =
                viewModelScope.launch { next.state.collect { search -> edit { it.copy(taskPicker = it.taskPicker?.let { search }) } } }
        }

        override fun typeTaskSearch(text: String) {
            picker?.type(text)
        }

        override fun closeTaskPicker() {
            picker?.close()
            pickerJob?.cancel()
            picker = null
            edit { it.copy(taskPicker = null) }
        }

        /** Escolher uma tarefa a liga ao artefato (a gravação fica para o Salvar) e fecha a folha. */
        override fun pickTask(card: TaskCard) {
            edit { form ->
                if (form.tasks.any { it.taskId == card.id }) {
                    form
                } else {
                    form.copy(tasks = form.tasks + LinkedTask(card.id, card.name, card.kind, card.startedAt))
                }
            }
            closeTaskPicker()
        }

        /** "Desligar da tarefa": tira a tarefa da lista; a gravação fica para o Salvar. */
        override fun unlinkTask(taskId: String) = edit { form -> form.copy(tasks = form.tasks.filterNot { it.taskId == taskId }) }

        override fun removeTag(tag: String) = edit { it.copy(tags = it.tags - tag) }

        private fun List<String>.withTag(raw: String): List<String> {
            val name = raw.trim().lowercase()
            return if (name.isEmpty() || name in this) this else this + name
        }

        override fun save() {
            val form = mutableState.value as? DocumentEditUiState.Form ?: return
            if (busy || form.saving) return
            if (form.isMeal && form.meal.isBlank()) return edit { it.copy(error = EMPTY_MEAL_MESSAGE) }
            if (!form.isMeal && form.body.isBlank()) return edit { it.copy(error = EMPTY_TEXT_MESSAGE) }
            busy = true
            // A tag digitada e não confirmada entra junto, como a que o web confirma ao sair do campo.
            val tags = form.tags.withTag(form.tagText)
            edit { it.copy(tags = tags, tagText = "", saving = true, error = null) }
            val content = TextContent(name = form.name.trim().ifEmpty { null }, tags = tags, body = form.body)
            // As tarefas só vão no corpo quando a pessoa escolheu alguma (criação) ou mexeu na lista (edição), como no web.
            val taskIds = form.tasks.map { it.taskId }.takeIf { it != initialTaskIds }
            viewModelScope.launch {
                try {
                    val savedId =
                        when {
                            documentId != null -> {
                                artifacts.updateText(documentId, revision, content, type, taskIds)
                                documentId
                            }
                            form.isMeal -> create(NewDocumentKind.Meal, ArtifactDraft.Meal(form.meal.trim()), taskIds)
                            else -> create(NewDocumentKind.Text, ArtifactDraft.Text(content), taskIds)
                        }
                    edit { it.copy(saving = false, savedId = savedId) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (stale: StaleRevisionException) {
                    refreshRevision()
                    fail(STALE_TEXT_MESSAGE)
                } catch (failure: Exception) {
                    fail(
                        when {
                            documentId != null -> EDIT_TEXT_FAILED
                            form.isMeal -> CREATE_MEAL_FAILED
                            else -> CREATE_TEXT_FAILED
                        },
                    )
                }
            }
        }

        /** A mesma chave enquanto o corpo for o mesmo (tocar em Salvar de novo não cria outro artefato); corpo novo, chave nova. */
        private suspend fun create(
            kind: NewDocumentKind,
            draft: ArtifactDraft,
            taskIds: List<String>?,
        ): String {
            val body = draft to taskIds
            val last = lastBodies[kind]
            if (last != null && last != body) idempotencyKeys[kind] = UUID.randomUUID().toString()
            lastBodies[kind] = body
            return artifacts.create(draft, checkNotNull(idempotencyKeys[kind]), taskIds)
        }

        /** Revisão velha: lê a revisão atual para a próxima tentativa; o texto digitado fica como está. */
        private suspend fun refreshRevision() {
            val id = documentId ?: return
            try {
                revision = artifacts.get(id).revision
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                // Sem a revisão nova, a próxima tentativa avisa de novo.
            }
        }

        private fun fail(message: String) {
            busy = false
            edit { it.copy(saving = false, error = message) }
        }
    }
