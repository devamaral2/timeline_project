package app.braid.mobile.ui.agenda

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.domain.agenda.AgendaRow
import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.timeline.relativeDayLabel
import app.braid.mobile.domain.timeline.shortDate
import app.braid.mobile.ui.shell.ExecutionReserveSpacer
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map

/** Entre duas leituras de uma borda passa ao menos isto, como no web. */
private const val EXTEND_COOLDOWN_MS = 400L

/** Perto do fim, a rolagem para baixo traz mais dias antes de a pessoa chegar a ele (600 px no web). */
private val NEXT_PREFETCH_DISTANCE = 600.dp

/** Perto do topo, a rolagem para cima traz os dias anteriores (240 px no web). */
private val PREVIOUS_PREFETCH_DISTANCE = 240.dp

/**
 * A Agenda "Em sequência": uma lista contínua de dias, cada um com o cabeçalho ("Hoje 14 set", "3 tarefas"), sem os
 * dias vazios. Chegar a uma borda pede mais 7 dias daquele lado, e o dia que está sendo lido vira o escolhido.
 */
@Composable
fun AgendaSequence(
    state: AgendaUiState,
    onVisibleDay: (String) -> Unit,
    onExtend: (AgendaEdge) -> Unit,
    onRetry: () -> Unit,
    onStatusClick: (TaskCard) -> Unit,
    onOpenTask: (String) -> Unit,
    onPlanFreeWindow: (FreeWindow) -> Unit,
    modifier: Modifier = Modifier,
) {
    val days = state.windowDays.filter { !state.shownOn(it).isNullOrEmpty() }
    val listState = rememberLazyListState()
    val currentDays by rememberUpdatedState(days)
    val currentOnVisibleDay by rememberUpdatedState(onVisibleDay)
    val currentOnExtend by rememberUpdatedState(onExtend)
    val bottomInset = with(LocalDensity.current) { WindowInsets.navigationBars.getBottom(this).toDp() }

    // Escolher um dia (faixa, mês ou "Hoje") recomeça a janela nele: a lista volta ao topo.
    LaunchedEffect(state.anchorDay) { listState.scrollToItem(0) }
    LaunchedEffect(listState) {
        snapshotFlow { currentDays.getOrNull(listState.firstVisibleItemIndex) }
            .filter { it != null }
            .distinctUntilChanged()
            .collect { currentOnVisibleDay(it!!) }
    }
    ExtendOnEdges(listState) { currentOnExtend(it) }

    val boundary = remember { EdgeAttemptConnection { currentOnExtend(it) } }
    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().nestedScroll(boundary),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 120.dp + bottomInset),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        items(days, key = { it }) { dayKey ->
            val rows = state.rowsOn(dayKey).orEmpty()
            Column(Modifier.fillMaxWidth()) {
                DayHeading(dayKey, state.todayKey, tasks = rows.count { it is AgendaRow.Task })
                AgendaRows(dayKey, rows, state.now, onStatusClick, onOpenTask, onPlanFreeWindow)
            }
        }
        item(key = "status") {
            Column {
                SequenceStatus(state, onRetry)
                // A gaveta de execução, quando há, ocupa o pé da tela: o último dia continua alcançável acima dela.
                ExecutionReserveSpacer()
            }
        }
    }
}

@Composable
private fun SequenceStatus(
    state: AgendaUiState,
    onRetry: () -> Unit,
) {
    when {
        state.load == AgendaLoad.Loading -> {
            Text(
                text = "Carregando sua agenda…",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.08.em,
            )
        }
        state.load == AgendaLoad.Failed -> LoadFailed(onRetry)
    }
}

@Composable
private fun DayHeading(
    dayKey: String,
    todayKey: String,
    tasks: Int,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.fillMaxWidth().padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Row(
            Modifier.weight(1f).semantics { heading() },
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                text = relativeDayLabel(dayKey, todayKey),
                color = MaterialTheme.colorScheme.onBackground,
                fontFamily = BraidDisplayFont,
                fontSize = 22.sp,
                lineHeight = 26.sp,
            )
            Text(
                text = shortDate(dayKey).uppercase(),
                modifier = Modifier.padding(bottom = 3.dp),
                color = muted,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.1.em,
            )
        }
        Text(text = "$tasks ${if (tasks == 1) "tarefa" else "tarefas"}", color = muted, fontSize = 13.sp, lineHeight = 18.sp)
    }
}

/** Perto das bordas, rolando naquele sentido, traz mais dias; no máximo uma leitura a cada [EXTEND_COOLDOWN_MS]. */
@Composable
private fun ExtendOnEdges(
    listState: LazyListState,
    onExtend: (AgendaEdge) -> Unit,
) {
    val density = LocalDensity.current
    val next = with(density) { NEXT_PREFETCH_DISTANCE.toPx() }
    val previous = with(density) { PREVIOUS_PREFETCH_DISTANCE.toPx() }
    val currentOnExtend by rememberUpdatedState(onExtend)
    LaunchedEffect(listState) {
        var lastIndex = listState.firstVisibleItemIndex
        var lastOffset = listState.firstVisibleItemScrollOffset
        var lastExtendAt = 0L
        snapshotFlow {
            Triple(
                listState.firstVisibleItemIndex,
                listState.firstVisibleItemScrollOffset,
                listState.layoutInfo.totalItemsCount,
            )
        }.map { (index, offset, _) ->
            val goingUp = index < lastIndex || (index == lastIndex && offset < lastOffset)
            val goingDown = index > lastIndex || (index == lastIndex && offset > lastOffset)
            lastIndex = index
            lastOffset = offset
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()
            val remaining =
                last?.let { (it.offset + it.size) - info.viewportEndOffset }?.takeIf {
                    last.index ==
                        info.totalItemsCount - 1
                }
            when {
                goingUp && index == 0 && offset < previous -> AgendaEdge.Previous
                goingDown && remaining != null && remaining <= next -> AgendaEdge.Next
                else -> null
            }
        }.collect { edge ->
            val now = System.nanoTime() / NANOS_PER_MILLI
            if (edge != null && now - lastExtendAt >= EXTEND_COOLDOWN_MS) {
                lastExtendAt = now
                currentOnExtend(edge)
            }
        }
    }
}

private const val NANOS_PER_MILLI = 1_000_000L

/**
 * A tentativa de rolar além do que a lista tem (o toque no topo ou no fim de uma lista curta, que não gera rolagem)
 * também traz mais dias, como o `wheel` e o `touchmove` na borda do web.
 */
private class EdgeAttemptConnection(
    private val onEdge: (AgendaEdge) -> Unit,
) : NestedScrollConnection {
    private var lastAt = 0L

    override fun onPostScroll(
        consumed: Offset,
        available: Offset,
        source: NestedScrollSource,
    ): Offset {
        val edge =
            when {
                available.y > 0f -> AgendaEdge.Previous
                available.y < 0f -> AgendaEdge.Next
                else -> null
            }
        val now = System.nanoTime() / NANOS_PER_MILLI
        if (edge != null && now - lastAt >= EXTEND_COOLDOWN_MS) {
            lastAt = now
            onEdge(edge)
        }
        return Offset.Zero
    }

    override suspend fun onPostFling(
        consumed: Velocity,
        available: Velocity,
    ): Velocity = Velocity.Zero
}
