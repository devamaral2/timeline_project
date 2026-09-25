package app.braid.mobile.ui.event

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface EventDetailUiState {
    data object Loading : EventDetailUiState

    data object Error : EventDetailUiState

    data class Content(
        val event: EventDetailDto,
        val isDeleting: Boolean = false,
        val deleteError: String? = null,
    ) : EventDetailUiState

    data object Deleted : EventDetailUiState
}

@HiltViewModel
class EventDetailViewModel
    @Inject
    constructor(
        private val gateway: EventGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<EventDetailUiState>(EventDetailUiState.Loading)

        val state: StateFlow<EventDetailUiState> = mutableState.asStateFlow()

        fun load(eventId: String) {
            mutableState.value = EventDetailUiState.Loading
            viewModelScope.launch {
                mutableState.value =
                    when (val result = gateway.detail(eventId)) {
                        is EventResult.Failure -> EventDetailUiState.Error
                        is EventResult.Success -> EventDetailUiState.Content(result.value)
                    }
            }
        }

        fun delete(eventId: String) {
            val current = mutableState.value as? EventDetailUiState.Content ?: return
            mutableState.value = current.copy(isDeleting = true, deleteError = null)
            viewModelScope.launch {
                mutableState.value =
                    when (gateway.delete(eventId)) {
                        is EventResult.Failure ->
                            current.copy(
                                isDeleting = false,
                                deleteError = "Não foi possível excluir o evento. Tente novamente.",
                            )
                        is EventResult.Success -> EventDetailUiState.Deleted
                    }
            }
        }
    }
