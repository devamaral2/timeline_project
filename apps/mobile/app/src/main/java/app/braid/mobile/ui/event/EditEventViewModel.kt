package app.braid.mobile.ui.event

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.UpdateEventInputDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventResult
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

@HiltViewModel
class EditEventViewModel
    @Inject
    constructor(
        private val gateway: EventGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<EditEventUiState>(EditEventUiState.Loading)

        val state: StateFlow<EditEventUiState> = mutableState.asStateFlow()

        fun load(eventId: String) {
            mutableState.value = EditEventUiState.Loading
            viewModelScope.launch {
                mutableState.value =
                    when (val result = gateway.detail(eventId)) {
                        is EventResult.Failure -> EditEventUiState.Error
                        is EventResult.Success -> EditEventUiState.Content(result.value)
                    }
            }
        }

        fun save(input: UpdateEventInputDto) {
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
