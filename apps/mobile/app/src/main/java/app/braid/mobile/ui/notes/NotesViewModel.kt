package app.braid.mobile.ui.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.CreateNoteInputDto
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.notes.NoteGateway
import app.braid.mobile.data.notes.NoteResult
import app.braid.mobile.domain.notes.NoteFilter
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NotesUiState(
    /** `null` até a primeira leitura; depois, a última lista — mesmo enquanto recarrega. */
    val notes: List<NoteDto>? = null,
    val isLoading: Boolean = true,
    val loadFailed: Boolean = false,
    val hiddenTags: Set<String> = emptySet(),
    val collapsedTags: Set<String> = emptySet(),
    val filter: NoteFilter = NoteFilter.All,
    val query: String = "",
    val isSearching: Boolean = false,
    val isCreating: Boolean = false,
    val isSaving: Boolean = false,
    val saveError: String? = null,
)

sealed interface NotesEvent {
    data class OpenNote(
        val noteId: String,
    ) : NotesEvent
}

@HiltViewModel
class NotesViewModel
    @Inject
    constructor(
        private val gateway: NoteGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(NotesUiState())
        private val events = Channel<NotesEvent>(Channel.BUFFERED)

        val state: StateFlow<NotesUiState> = mutableState.asStateFlow()
        val uiEvents = events.receiveAsFlow()

        /** Lê a lista; quem já a viu continua vendo-a enquanto a nova chega. */
        fun load() {
            mutableState.update { it.copy(isLoading = true, loadFailed = false) }
            viewModelScope.launch {
                when (val result = gateway.list()) {
                    is NoteResult.Success -> mutableState.update { it.copy(notes = result.value, isLoading = false) }
                    is NoteResult.Failure -> mutableState.update { it.copy(isLoading = false, loadFailed = true) }
                }
            }
        }

        fun toggleTag(tag: String) =
            mutableState.update {
                it.copy(hiddenTags = if (tag in it.hiddenTags) it.hiddenTags - tag else it.hiddenTags + tag)
            }

        fun toggleGroup(tag: String) =
            mutableState.update {
                it.copy(collapsedTags = if (tag in it.collapsedTags) it.collapsedTags - tag else it.collapsedTags + tag)
            }

        fun setFilter(filter: NoteFilter) = mutableState.update { it.copy(filter = filter) }

        fun setQuery(query: String) = mutableState.update { it.copy(query = query) }

        fun toggleSearch() = mutableState.update { it.copy(isSearching = !it.isSearching, query = "") }

        fun startCreating() = mutableState.update { it.copy(isCreating = true, saveError = null) }

        fun dismissCreating() = mutableState.update { if (it.isSaving) it else it.copy(isCreating = false, saveError = null) }

        fun create(draft: NoteDraft) {
            if (draft.isBlank || mutableState.value.isSaving) return
            mutableState.update { it.copy(isSaving = true, saveError = null) }
            viewModelScope.launch {
                val input =
                    CreateNoteInputDto.text(
                        content = draft.content,
                        name = draft.name.trim().ifEmpty { null },
                        tags = draft.tags,
                    )
                when (val result = gateway.create(input)) {
                    is NoteResult.Success -> {
                        mutableState.update { it.copy(isSaving = false, isCreating = false) }
                        events.send(NotesEvent.OpenNote(result.value.noteId))
                    }
                    is NoteResult.Failure ->
                        mutableState.update {
                            it.copy(isSaving = false, saveError = "Não foi possível salvar a nota. Tente novamente.")
                        }
                }
            }
        }
    }
