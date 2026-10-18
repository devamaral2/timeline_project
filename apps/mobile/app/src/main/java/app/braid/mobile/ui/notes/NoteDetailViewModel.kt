package app.braid.mobile.ui.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.UpdateNoteInput
import app.braid.mobile.data.notes.NoteGateway
import app.braid.mobile.data.notes.NoteResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface NoteDetailUiState {
    data object Loading : NoteDetailUiState

    data object Error : NoteDetailUiState

    data class Content(
        val note: NoteDto,
        val isEditing: Boolean = false,
        val isDeleting: Boolean = false,
        val isSaving: Boolean = false,
        /** Erro da última ação (editar, soltar ou excluir); some quando a ação seguinte dá certo. */
        val actionError: String? = null,
    ) : NoteDetailUiState

    data object Deleted : NoteDetailUiState
}

@HiltViewModel
class NoteDetailViewModel
    @Inject
    constructor(
        private val gateway: NoteGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<NoteDetailUiState>(NoteDetailUiState.Loading)

        val state: StateFlow<NoteDetailUiState> = mutableState.asStateFlow()
        private var observation: Job? = null

        fun load(noteId: String) {
            observation?.cancel()
            mutableState.value = NoteDetailUiState.Loading
            observation =
                viewModelScope.launch {
                    mutableState.value =
                        when (val result = gateway.detail(noteId)) {
                            is NoteResult.Failure -> NoteDetailUiState.Error
                            is NoteResult.Success -> NoteDetailUiState.Content(result.value)
                        }
                    while ((mutableState.value as? NoteDetailUiState.Content)?.note?.generationPending == true) {
                        delay(2_000)
                        val result = gateway.detail(noteId)
                        if (result is NoteResult.Success) {
                            updateContent { it.copy(note = result.value) }
                        }
                    }
                }
        }

        fun startEditing() = updateContent { if (it.note.generationPending) it else it.copy(isEditing = true, actionError = null) }

        fun dismissEditing() = updateContent { if (it.isSaving) it else it.copy(isEditing = false, actionError = null) }

        fun save(draft: NoteDraft) {
            val current = mutableState.value as? NoteDetailUiState.Content ?: return
            if (draft.isBlank || current.isSaving || current.note.generationPending) return
            mutableState.value = current.copy(isSaving = true, actionError = null)
            viewModelScope.launch {
                val input =
                    UpdateNoteInput(
                        expectedRevision = current.note.revision,
                        name = draft.name.trim().ifEmpty { null },
                        content = draft.content,
                        tags = draft.tags,
                    )
                when (gateway.update(current.note.id, input)) {
                    is NoteResult.Success -> reload(current.note.id)
                    is NoteResult.Failure ->
                        mutableState.value =
                            current.copy(isSaving = false, actionError = "Não foi possível salvar a nota. Tente novamente.")
                }
            }
        }

        /** Solta a nota do evento ou da tarefa a que ela está presa. */
        fun detach() {
            val current = mutableState.value as? NoteDetailUiState.Content ?: return
            if (current.isSaving || current.note.link == null || current.note.generationPending) return
            mutableState.value = current.copy(isSaving = true, actionError = null)
            viewModelScope.launch {
                when (gateway.update(current.note.id, UpdateNoteInput(expectedRevision = current.note.revision, detach = true))) {
                    is NoteResult.Success -> reload(current.note.id)
                    is NoteResult.Failure ->
                        mutableState.value =
                            current.copy(isSaving = false, actionError = "Não foi possível soltar a nota. Tente novamente.")
                }
            }
        }

        fun startDeleting() = updateContent { it.copy(isDeleting = true, actionError = null) }

        fun dismissDeleting() = updateContent { if (it.isSaving) it else it.copy(isDeleting = false, actionError = null) }

        fun delete() {
            val current = mutableState.value as? NoteDetailUiState.Content ?: return
            if (current.isSaving) return
            mutableState.value = current.copy(isSaving = true, actionError = null)
            viewModelScope.launch {
                mutableState.value =
                    when (gateway.delete(current.note.id)) {
                        is NoteResult.Success -> NoteDetailUiState.Deleted
                        is NoteResult.Failure ->
                            current.copy(isSaving = false, actionError = "Não foi possível excluir a nota. Tente novamente.")
                    }
            }
        }

        /**
         * Depois de salvar, lê de novo: o servidor é quem sabe a revisão e o vínculo novos.
         * Se a leitura falhar, a tela não finge que sabe — cai no erro, que oferece tentar de novo.
         */
        private suspend fun reload(noteId: String) {
            mutableState.value =
                when (val result = gateway.detail(noteId)) {
                    is NoteResult.Success -> NoteDetailUiState.Content(result.value)
                    is NoteResult.Failure -> NoteDetailUiState.Error
                }
        }

        private fun updateContent(transform: (NoteDetailUiState.Content) -> NoteDetailUiState.Content) {
            val current = mutableState.value as? NoteDetailUiState.Content ?: return
            mutableState.value = transform(current)
        }
    }
