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
import app.braid.mobile.domain.task.StaleRevisionException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/** O que o formulário de criação cria: a nota de texto ou o alimento. */
enum class NewDocumentKind(
    val label: String,
) {
    Text("Nota"),
    Meal("Alimento"),
}

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

sealed interface DocumentEditUiState {
    data object Loading : DocumentEditUiState

    data object Failed : DocumentEditUiState

    /** Só a nota de texto própria se edita aqui: a de outro tipo, ou a global, não. */
    data object NotEditable : DocumentEditUiState

    data class Form(
        /** Editando um documento que já existe; senão é a criação. */
        val existing: Boolean,
        val kind: NewDocumentKind = NewDocumentKind.Text,
        val name: String = "",
        val body: String = "",
        val meal: String = "",
        val tags: List<String> = emptyList(),
        /** O que está digitado no campo "Nova tag" e ainda não virou chip. */
        val tagText: String = "",
        val mode: EditorMode = EditorMode.Write,
        val saving: Boolean = false,
        val error: String? = null,
        /** O id do documento salvo ou criado: a tela abre a leitura dele. */
        val savedId: String? = null,
    ) : DocumentEditUiState {
        /** O alimento só existe na criação e vai só com o texto do que foi comido. */
        val isMeal: Boolean get() = !existing && kind == NewDocumentKind.Meal
    }
}

/**
 * O formulário do documento, na criação (`/nota` do chat) e na edição da nota de texto. A criação guarda uma chave de
 * idempotência por tipo enquanto o formulário está aberto; a edição manda a revisão lida e o conteúdo inteiro.
 */
@HiltViewModel
class DocumentEditViewModel
    @Inject
    constructor(
        savedState: SavedStateHandle,
        private val artifacts: ArtifactRepository,
    ) : ViewModel(),
        DocumentEditActions {
        private val documentId: String? = savedState["documentId"]
        private val mutableState =
            MutableStateFlow<DocumentEditUiState>(
                if (documentId == null) {
                    DocumentEditUiState.Form(existing = false, name = savedState.get<String>("name").orEmpty())
                } else {
                    DocumentEditUiState.Loading
                },
            )
        val state: StateFlow<DocumentEditUiState> = mutableState.asStateFlow()

        // Uma chave por tipo: trocar de Nota para Alimento e voltar não reaproveita a chave de outro corpo.
        private val idempotencyKeys = NewDocumentKind.entries.associateWith { UUID.randomUUID().toString() }
        private var revision = 0

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

        private val Artifact.editable: Boolean get() = type == ArtifactType.Text && !global && data is TextData

        private fun form(artifact: Artifact): DocumentEditUiState.Form {
            revision = artifact.revision
            return DocumentEditUiState.Form(
                existing = true,
                name = artifact.name,
                body = (artifact.data as TextData).body,
                tags = artifact.tags,
            )
        }

        private fun edit(transform: (DocumentEditUiState.Form) -> DocumentEditUiState.Form) =
            mutableState.update { (it as? DocumentEditUiState.Form)?.let(transform) ?: it }

        override fun selectKind(kind: NewDocumentKind) = edit { it.copy(kind = kind, error = null) }

        override fun setName(name: String) = edit { it.copy(name = name) }

        override fun setBody(body: String) = edit { it.copy(body = body) }

        override fun setMeal(meal: String) = edit { it.copy(meal = meal) }

        override fun setMode(mode: EditorMode) = edit { it.copy(mode = mode) }

        override fun setTagText(text: String) = edit { it.copy(tagText = text) }

        /** Confirma o que está no campo "Nova tag": minúsculo, aparado, sem repetir e sem vazio. */
        override fun commitTag() = edit { it.copy(tags = it.tags.withTag(it.tagText), tagText = "") }

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
            viewModelScope.launch {
                try {
                    val savedId =
                        when {
                            documentId != null -> {
                                artifacts.updateText(documentId, revision, content)
                                documentId
                            }
                            form.isMeal -> artifacts.create(ArtifactDraft.Meal(form.meal.trim()), key(NewDocumentKind.Meal))
                            else -> artifacts.create(ArtifactDraft.Text(content), key(NewDocumentKind.Text))
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

        private fun key(kind: NewDocumentKind): String = checkNotNull(idempotencyKeys[kind])

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
