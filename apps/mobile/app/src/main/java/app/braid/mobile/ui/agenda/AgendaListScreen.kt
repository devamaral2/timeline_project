package app.braid.mobile.ui.agenda

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.reminders.ReminderEventSource
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.domain.timeline.AgendaEntry
import app.braid.mobile.domain.timeline.FreeTimeSlot
import app.braid.mobile.domain.timeline.agendaEntriesOf
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import java.time.Instant

/** Uma linha da lista contínua: o cabeçalho do dia, um evento, o tempo livre entre eventos ou um aviso de carregamento nas pontas. */
private sealed interface ListRow {
    val key: String
    val dayKey: String?

    data class Heading(
        override val dayKey: String,
        val eventCount: Int,
    ) : ListRow {
        override val key get() = "h:$dayKey"
    }

    data class Event(
        override val dayKey: String,
        val event: app.braid.mobile.data.dto.TimelineEventCardDto,
    ) : ListRow {
        override val key get() = "e:$dayKey:${event.id}"
    }

    data class FreeTime(
        override val dayKey: String,
        val slot: FreeTimeSlot,
    ) : ListRow {
        override val key get() = "f:$dayKey:${slot.start.toEpochMilli()}"
    }

    data class Note(
        override val key: String,
        val text: String,
        val action: String? = null,
        val onAction: (() -> Unit)? = null,
    ) : ListRow {
        override val dayKey: String? get() = null
    }
}

/**
 * A agenda em lista contínua (o modo “Lista” com ∞ do web): dias em sequência a
 * partir de `anchorDay`, que cresce para cima e para baixo conforme a rolagem
 * chega às bordas. Dias sem evento ficam de fora, como no web (`hideWhenEmpty`).
 * `onVisibleDayChange` informa o dia que está no topo, para a tira da semana e o
 * mês acompanharem a leitura.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun AgendaListScreen(
    anchorDay: String,
    anchorVersion: Int,
    refreshSignal: Int,
    onVisibleDayChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    onOpenEvent: (String) -> Unit = {},
    reminderScheduler: ReminderScheduler? = null,
    viewModel: AgendaListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val now = rememberCurrentInstant()
    val listState = rememberLazyListState()

    LaunchedEffect(anchorDay, anchorVersion, refreshSignal) { viewModel.start(anchorDay) }
    LaunchedEffect(state.days, reminderScheduler) {
        if (reminderScheduler != null) {
            reminderScheduler.schedule(
                state.days.flatMap { it.events }.map { event ->
                    ReminderEventSource(
                        id = event.id,
                        name = event.name,
                        startedAt = Instant.parse(event.startedAt),
                        notifyOffsetsMinutes = event.notifyOffsetsMinutes,
                    )
                },
            )
        }
    }

    val rows =
        remember(state) {
            buildList {
                if (state.isLoadingPrevious) add(ListRow.Note("loading-previous", "Carregando dias anteriores…"))
                if (state.failedAtStart) {
                    add(
                        ListRow.Note(
                            "failed-previous",
                            "Não foi possível carregar os dias anteriores.",
                            "Tentar novamente",
                            viewModel::retryEdges,
                        ),
                    )
                }
                state.days.filter { it.events.isNotEmpty() }.forEach { day ->
                    add(ListRow.Heading(day.dayKey, day.events.size))
                    agendaEntriesOf(day.events, day.dayKey).forEach { entry ->
                        add(
                            when (entry) {
                                is AgendaEntry.Event -> ListRow.Event(day.dayKey, entry.event)
                                is AgendaEntry.FreeTime -> ListRow.FreeTime(day.dayKey, entry.slot)
                            },
                        )
                    }
                }
                when {
                    state.failedAtEnd ->
                        add(ListRow.Note("failed-next", "Não foi possível carregar mais dias.", "Tentar novamente", viewModel::retryEdges))
                    state.isLoadingNext -> add(ListRow.Note("loading-next", "Carregando mais dias…"))
                    state.reachedEnd -> add(ListRow.Note("end", "Fim da agenda."))
                }
            }
        }

    // Estende para baixo enquanto o fim da lista está à vista: se os dias novos vierem vazios, segue lendo.
    val nearEnd by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: -1
            last >= info.totalItemsCount - 3
        }
    }
    LaunchedEffect(nearEnd, state.days.size, state.isLoading, state.isLoadingNext, state.failedAtEnd) {
        if (nearEnd && !state.isLoading) viewModel.extendNext()
    }
    // Para cima só depois de uma rolagem para cima, para não puxar dias antes de a pessoa pedir.
    val nearStart by remember {
        derivedStateOf { listState.firstVisibleItemIndex <= 2 && listState.lastScrolledBackward }
    }
    LaunchedEffect(nearStart, state.days.size, state.isLoadingPrevious) {
        if (nearStart) viewModel.extendPrevious()
    }
    LaunchedEffect(listState, rows) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .map { index -> rows.drop(index).firstNotNullOfOrNull { it.dayKey } }
            .filterNotNull()
            .distinctUntilChanged()
            .collect(onVisibleDayChange)
    }

    Box(modifier = modifier.fillMaxSize()) {
        when {
            state.isLoading -> AgendaDaySkeleton(modifier = Modifier.fillMaxSize())
            state.loadFailed ->
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        "Não foi possível carregar a agenda",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = viewModel::retryInitial) { Text("Tentar novamente") }
                }
            else ->
                PullToRefreshBox(
                    isRefreshing = false,
                    onRefresh = { viewModel.start(anchorDay, forceRefresh = true) },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        state = listState,
                        contentPadding = PaddingValues(18.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(rows, key = { it.key }) { row ->
                            when (row) {
                                is ListRow.Heading -> DayHeading(dayKey = row.dayKey, eventCount = row.eventCount)
                                is ListRow.Event ->
                                    EventCard(event = row.event, now = now, onClick = { onOpenEvent(row.event.id) })
                                is ListRow.FreeTime -> FreeTimeCard(slot = row.slot, now = now)
                                is ListRow.Note ->
                                    Column(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                    ) {
                                        Text(
                                            text = row.text,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            textAlign = TextAlign.Center,
                                        )
                                        if (row.action != null && row.onAction != null) {
                                            TextButton(onClick = row.onAction) { Text(row.action) }
                                        }
                                    }
                            }
                        }
                    }
                }
        }
    }
}
