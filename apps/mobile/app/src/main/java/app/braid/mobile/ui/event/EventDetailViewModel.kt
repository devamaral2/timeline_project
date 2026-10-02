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

sealed interface EventDetailUiState {
    data object Loading : EventDetailUiState

    data object Error : EventDetailUiState

    data class Content(
        val event: EventDetailDto,
        val isDeleting: Boolean = false,
        val deleteError: String? = null,
        val isSavingMissed: Boolean = false,
        val missedError: String? = null,
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

        /** Alterna entre "aconteceu" e "não realizado"; o estado só muda depois da resposta. */
        fun setMissed(missed: Boolean) {
            val current = mutableState.value as? EventDetailUiState.Content ?: return
            if (current.isSavingMissed) return
            mutableState.value = current.copy(isSavingMissed = true, missedError = null)
            viewModelScope.launch {
                val result =
                    gateway.update(
                        UpdateEventInputDto(
                            eventId = current.event.id,
                            expectedRevision = current.event.revision,
                            missed = missed,
                        ),
                    )
                mutableState.value =
                    when (result) {
                        is EventResult.Failure ->
                            current.copy(
                                isSavingMissed = false,
                                missedError = "Não foi possível atualizar a situação. Tente novamente.",
                            )
                        is EventResult.Success ->
                            current.copy(
                                event = current.event.copy(missed = missed, revision = current.event.revision + 1),
                                isSavingMissed = false,
                            )
                    }
            }
        }
    }
