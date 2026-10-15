package app.braid.mobile.ui.event

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.MealEventNoteDto
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.UpdateEventInputDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.data.notes.NoteGateway
import app.braid.mobile.data.notes.NoteResult
import app.braid.mobile.domain.events.linkableNotesOf
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface EditEventUiState {
    data object Loading : EditEventUiState

    data object Error : EditEventUiState

    data class Content(
        val event: EventDetailDto,
    ) : EditEventUiState

    data object Saving : EditEventUiState

    data object Saved : EditEventUiState

    data class SaveError(
        val message: String,
    ) : EditEventUiState
}

/** As notas que a edição oferece para associar ao evento. */
sealed interface LinkableNotesUiState {
    data object Loading : LinkableNotesUiState

    data object Failed : LinkableNotesUiState

    data class Loaded(
        val notes: List<NoteDto>,
    ) : LinkableNotesUiState
}

@HiltViewModel
class EditEventViewModel
    @Inject
    constructor(
        private val gateway: EventGateway,
        private val notes: NoteGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<EditEventUiState>(EditEventUiState.Loading)
        private val mutableLinkableNotes = MutableStateFlow<LinkableNotesUiState>(LinkableNotesUiState.Loading)

        val state: StateFlow<EditEventUiState> = mutableState.asStateFlow()
        val linkableNotes: StateFlow<LinkableNotesUiState> = mutableLinkableNotes.asStateFlow()

        fun load(eventId: String) {
            mutableState.value = EditEventUiState.Loading
            mutableLinkableNotes.value = LinkableNotesUiState.Loading
            viewModelScope.launch {
                when (val result = gateway.detail(eventId)) {
                    is EventResult.Failure -> mutableState.value = EditEventUiState.Error
                    is EventResult.Success -> {
                        mutableState.value = EditEventUiState.Content(result.value)
                        mutableLinkableNotes.value =
                            when (val all = notes.list()) {
                                is NoteResult.Failure -> LinkableNotesUiState.Failed
                                is NoteResult.Success -> LinkableNotesUiState.Loaded(linkableNotesOf(all.value, result.value))
                            }
                    }
                }
            }
        }

        fun save(input: UpdateEventInputDto) {
            val event = (mutableState.value as? EditEventUiState.Content)?.event
            if (event?.notes?.any { it is MealEventNoteDto && it.data.generation?.status == "pending" } == true) return
            mutableState.value = EditEventUiState.Saving
            viewModelScope.launch {
                mutableState.value =
                    when (gateway.update(input)) {
                        is EventResult.Failure -> EditEventUiState.SaveError("Não foi possível salvar as alterações.")
                        is EventResult.Success -> EditEventUiState.Saved
                    }
            }
        }
    }
