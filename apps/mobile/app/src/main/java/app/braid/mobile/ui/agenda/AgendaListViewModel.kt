package app.braid.mobile.ui.agenda

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.TimelineEventCardDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.domain.timeline.dayKeyRange
import app.braid.mobile.domain.timeline.eventsOnDay
import app.braid.mobile.domain.timeline.shiftDayKey
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Um dia da lista contínua; `events` vazio quando nada foi marcado (a lista esconde esses dias). */
data class AgendaDayEntry(
    val dayKey: String,
    val events: List<TimelineEventCardDto>,
)

data class AgendaListUiState(
    /** Dias seguidos, do mais antigo ao mais novo, sem buracos. */
    val days: List<AgendaDayEntry> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingPrevious: Boolean = false,
    val isLoadingNext: Boolean = false,
    /** A última leitura de mais dias falhou: a lista mostra “Tentar novamente” na ponta. */
    val failedAtStart: Boolean = false,
    val failedAtEnd: Boolean = false,
    val loadFailed: Boolean = false,
    val reachedStart: Boolean = false,
    val reachedEnd: Boolean = false,
)

/** `INFINITE_STEP_DAYS` e `INFINITE_MAX_DAYS` do `agenda-preview.tsx`. */
private const val STEP_DAYS = 7
private const val MAX_DAYS_PER_SIDE = 364

/**
 * A lista contínua da agenda, que o botão ∞ liga: parte de um dia, lê sete dias
 * por vez e estende para cima ou para baixo quando a rolagem chega à borda.
 */
@HiltViewModel
class AgendaListViewModel
    @Inject
    constructor(
        private val repository: EventGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(AgendaListUiState())
        val state: StateFlow<AgendaListUiState> = mutableState.asStateFlow()

        private var anchor: String? = null
        private var firstDay: String? = null
        private var lastDay: String? = null
        private var job: Job? = null

        /** Recomeça a partir de `anchorDay`: uma escolha explícita de dia, ou um refresh. */
        fun start(
            anchorDay: String,
            forceRefresh: Boolean = false,
        ) {
            job?.cancel()
            anchor = anchorDay
            firstDay = anchorDay
            lastDay = anchorDay
            mutableState.value = AgendaListUiState()
            job =
                viewModelScope.launch {
                    val days = dayKeyRange(anchorDay, STEP_DAYS)
                    val loaded = load(days, forceRefresh)
                    if (loaded == null) {
                        mutableState.value = AgendaListUiState(isLoading = false, loadFailed = true)
                    } else {
                        lastDay = days.last()
                        mutableState.value = AgendaListUiState(days = loaded, isLoading = false)
                    }
                }
        }

        fun extendNext() {
            val current = mutableState.value
            val last = lastDay ?: return
            val base = anchor ?: return
            if (current.isLoading || current.isLoadingNext || current.reachedEnd || current.failedAtEnd) return
            if (daysBetween(base, last) >= MAX_DAYS_PER_SIDE) {
                mutableState.update { it.copy(reachedEnd = true) }
                return
            }
            mutableState.update { it.copy(isLoadingNext = true) }
            val generation = job
            viewModelScope.launch {
                val days = dayKeyRange(shiftDayKey(last, 1), STEP_DAYS)
                val loaded = load(days)
                if (generation !== job || lastDay != last) return@launch
                if (loaded == null) {
                    mutableState.update { it.copy(isLoadingNext = false, failedAtEnd = true) }
                } else {
                    lastDay = days.last()
                    mutableState.update { it.copy(days = it.days + loaded, isLoadingNext = false) }
                }
            }
        }

        fun extendPrevious() {
            val current = mutableState.value
            val first = firstDay ?: return
            val base = anchor ?: return
            if (current.isLoading || current.isLoadingPrevious || current.reachedStart || current.failedAtStart) return
            if (daysBetween(first, base) >= MAX_DAYS_PER_SIDE) {
                mutableState.update { it.copy(reachedStart = true) }
                return
            }
            mutableState.update { it.copy(isLoadingPrevious = true) }
            val generation = job
            viewModelScope.launch {
                val days = dayKeyRange(shiftDayKey(first, -STEP_DAYS.toLong()), STEP_DAYS)
                val loaded = load(days)
                if (generation !== job || firstDay != first) return@launch
                if (loaded == null) {
                    mutableState.update { it.copy(isLoadingPrevious = false, failedAtStart = true) }
                } else {
                    firstDay = days.first()
                    mutableState.update { it.copy(days = loaded + it.days, isLoadingPrevious = false) }
                }
            }
        }

        fun retryEdges() {
            mutableState.update { it.copy(failedAtStart = false, failedAtEnd = false) }
        }

        fun retryInitial() {
            anchor?.let { start(it) }
        }

        private suspend fun load(
            days: List<String>,
            forceRefresh: Boolean = false,
        ): List<AgendaDayEntry>? =
            coroutineScope {
                days
                    .map { dayKey -> async { dayKey to repository.day(dayKey, forceRefresh = forceRefresh) } }
                    .awaitAll()
            }.let { results ->
                if (results.any { it.second is EventResult.Failure }) {
                    null
                } else {
                    results.map { (dayKey, result) ->
                        AgendaDayEntry(dayKey, eventsOnDay(dayKey, (result as EventResult.Success).value.items))
                    }
                }
            }

        private fun daysBetween(
            from: String,
            to: String,
        ): Long =
            java.time.temporal.ChronoUnit.DAYS
                .between(java.time.LocalDate.parse(from), java.time.LocalDate.parse(to))
    }
