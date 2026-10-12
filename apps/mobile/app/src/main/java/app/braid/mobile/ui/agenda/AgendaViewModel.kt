package app.braid.mobile.ui.agenda

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.TimelineEventCardDto
import app.braid.mobile.data.dto.TimelineEventPageDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.domain.timeline.longestDurationOf
import app.braid.mobile.domain.timeline.trackedMinutesOf
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface AgendaUiState {
    data object Loading : AgendaUiState

    data class Error(
        val dayKey: String,
    ) : AgendaUiState

    data class Empty(
        val dayKey: String,
    ) : AgendaUiState

    data class Content(
        val dayKey: String,
        val events: List<TimelineEventCardDto>,
        val trackedMinutes: Int,
        val longestMinutes: Int,
        val nextCursor: String? = null,
        val isRefreshing: Boolean = false,
        val refreshFailed: Boolean = false,
    ) : AgendaUiState
}

@HiltViewModel
class AgendaViewModel
    @Inject
    constructor(
        private val repository: EventGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<AgendaUiState>(AgendaUiState.Loading)

        val state: StateFlow<AgendaUiState> = mutableState.asStateFlow()

        fun loadDay(dayKey: String) {
            mutableState.value = AgendaUiState.Loading
            viewModelScope.launch {
                mutableState.value = stateOf(dayKey, repository.day(dayKey))
            }
        }

        fun refreshDay(dayKey: String) {
            val current = mutableState.value
            if (current !is AgendaUiState.Content || current.dayKey != dayKey) {
                loadDay(dayKey)
                return
            }

            mutableState.value = current.copy(isRefreshing = true, refreshFailed = false)
            viewModelScope.launch {
                when (val result = repository.day(dayKey, forceRefresh = true)) {
                    is EventResult.Failure -> {
                        val latest = mutableState.value
                        if (latest is AgendaUiState.Content && latest.dayKey == dayKey) {
                            mutableState.value = latest.copy(isRefreshing = false, refreshFailed = true)
                        }
                    }
                    is EventResult.Success -> mutableState.value = stateOf(dayKey, result)
                }
            }
        }

        private fun stateOf(
            dayKey: String,
            result: EventResult<TimelineEventPageDto>,
        ): AgendaUiState =
            when (result) {
                is EventResult.Failure -> AgendaUiState.Error(dayKey)
                is EventResult.Success -> {
                    val page = result.value
                    if (page.items.isEmpty()) {
                        AgendaUiState.Empty(dayKey)
                    } else {
                        AgendaUiState.Content(
                            dayKey = dayKey,
                            events = page.items,
                            trackedMinutes = trackedMinutesOf(page.items),
                            longestMinutes = longestDurationOf(page.items),
                            nextCursor = page.nextCursor,
                        )
                    }
                }
            }
    }
