package app.braid.mobile.ui.agenda

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.timeline.daysBetween
import app.braid.mobile.domain.timeline.longDate
import app.braid.mobile.domain.timeline.shiftDayKey
import app.braid.mobile.ui.shell.MainTab
import app.braid.mobile.ui.shell.PublishSectionMenu
import app.braid.mobile.ui.shell.SectionChoice
import app.braid.mobile.ui.shell.SectionMenuModel
import app.braid.mobile.ui.shell.SectionSearch
import app.braid.mobile.ui.shell.SectionSetting
import app.braid.mobile.ui.tasks.TaskStatusSheet
import kotlin.math.abs

/** Um século de dias para cada lado de hoje: o swipe não tem borda que alguém alcance. */
private const val DAYS_EACH_SIDE = 36_500
private const val PAGE_COUNT = DAYS_EACH_SIDE * 2 + 1
private const val SMOOTH_SCROLL_MAX_DAYS = 7

@Composable
fun AgendaScreen(
    viewModel: AgendaViewModel = hiltViewModel(),
    /** O toque numa janela livre: o chat (ticket 12) abre uma conversa nova com ela anexada. */
    onPlanFreeWindow: (FreeWindow) -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // O primeiro ON_RESUME é o de abrir a tela, e o ViewModel já leu a semana ao nascer.
    var firstResume by remember { mutableStateOf(true) }
    LifecycleResumeEffect(Unit) {
        if (firstResume) firstResume = false else viewModel.onResume()
        // A releitura das tarefas de agente abertas só anda com a tela à vista.
        viewModel.setVisible(true)
        onPauseOrDispose { viewModel.setVisible(false) }
    }
    AgendaContent(
        state = state,
        onSelectDay = viewModel::selectDay,
        onRetry = viewModel::retry,
        onStatusClick = viewModel::openStatusPicker,
        onVisibleDay = viewModel::showVisibleDay,
        onExtend = viewModel::extend,
        onPlanFreeWindow = onPlanFreeWindow,
    )
    state.statusPicker?.let { card ->
        TaskStatusSheet(
            taskName = card.name,
            longRunning = card.longRunning,
            current = card.status,
            onPick = viewModel::chooseStatus,
            onDismiss = viewModel::dismissStatusPicker,
        )
    }
    // O menu da seção (tocar de novo na aba Agenda): a busca filtra as tarefas já lidas pelo nome.
    PublishSectionMenu(
        tab = MainTab.Agenda,
        model =
            SectionMenuModel(
                settings =
                    listOf(
                        SectionSetting.Segment(
                            label = "Visualização",
                            options =
                                listOf(
                                    SectionChoice("Por dia", state.mode == AgendaMode.Day) { viewModel.setMode(AgendaMode.Day) },
                                    SectionChoice(
                                        "Em sequência",
                                        state.mode == AgendaMode.Sequence,
                                    ) { viewModel.setMode(AgendaMode.Sequence) },
                                ),
                        ),
                        SectionSetting.Switch(
                            label = "Tempo livre",
                            on = state.showFreeTime,
                            onToggle = { viewModel.setFreeTime(!state.showFreeTime) },
                        ),
                    ),
                search = SectionSearch(label = "Buscar na agenda", value = state.search, onChange = viewModel::search),
                filtered = state.searching,
                onClear = { viewModel.search("") },
            ),
    )
}

@Composable
fun AgendaContent(
    state: AgendaUiState,
    onSelectDay: (String) -> Unit,
    onRetry: () -> Unit,
    onStatusClick: (TaskCard) -> Unit,
    onVisibleDay: (String) -> Unit,
    onExtend: (AgendaEdge) -> Unit,
    onPlanFreeWindow: (FreeWindow) -> Unit,
) {
    // O dia da página central é o de quando a tela abriu: de lá cada página é um dia a mais ou a menos.
    val anchorDay = rememberSaveable { state.todayKey }
    var monthOpen by rememberSaveable { mutableStateOf(false) }

    fun choose(dayKey: String) {
        monthOpen = false
        onSelectDay(dayKey)
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars),
    ) {
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                text = longDate(state.todayKey).uppercase(),
                modifier = Modifier.padding(top = 14.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.08.em,
            )
            Column(Modifier.padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (monthOpen) {
                    MonthPicker(
                        selectedDay = state.selectedDay,
                        todayKey = state.todayKey,
                        onSelect = ::choose,
                        onClose = { monthOpen = false },
                    )
                } else {
                    MonthToggle(
                        label = monthName(state.selectedDay, state.todayKey),
                        expanded = false,
                        onClick = { monthOpen = true },
                    )
                    // Em sequência não há faixa da semana: a lista contínua é o calendário.
                    if (state.mode == AgendaMode.Day) {
                        WeekStrip(selectedDay = state.selectedDay, todayKey = state.todayKey, onSelect = ::choose)
                    }
                }
            }
        }
        state.notice?.let { notice ->
            Text(
                text = notice,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp).semantics { liveRegion = LiveRegionMode.Assertive },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
        }
        when (state.mode) {
            AgendaMode.Day ->
                DayPager(
                    state = state,
                    anchorDay = anchorDay,
                    onSelectDay = onSelectDay,
                    onRetry = onRetry,
                    onStatusClick = onStatusClick,
                    onPlanFreeWindow = onPlanFreeWindow,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                )
            AgendaMode.Sequence ->
                AgendaSequence(
                    state = state,
                    onVisibleDay = onVisibleDay,
                    onExtend = onExtend,
                    onRetry = onRetry,
                    onStatusClick = onStatusClick,
                    onPlanFreeWindow = onPlanFreeWindow,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                )
        }
    }
}

/** O carrossel de dias do modo "Por dia": um dia por página, o swipe escolhe o dia. */
@Composable
private fun DayPager(
    state: AgendaUiState,
    anchorDay: String,
    onSelectDay: (String) -> Unit,
    onRetry: () -> Unit,
    onStatusClick: (TaskCard) -> Unit,
    onPlanFreeWindow: (FreeWindow) -> Unit,
    modifier: Modifier = Modifier,
) {
    val pager = rememberPagerState(initialPage = pageOf(anchorDay, state.selectedDay)) { PAGE_COUNT }
    val currentOnSelectDay by rememberUpdatedState(onSelectDay)
    DaySwipeSync(pager, anchorDay, state.selectedDay) { currentOnSelectDay(it) }
    HorizontalPager(state = pager, modifier = modifier, key = { it }) { page ->
        val dayKey = dayKeyAt(anchorDay, page)
        val bottomInset = with(LocalDensity.current) { WindowInsets.navigationBars.getBottom(this).toDp() }
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 120.dp + bottomInset),
        ) {
            AgendaDay(
                dayKey = dayKey,
                rows = state.rowsOn(dayKey),
                load = state.load,
                now = state.now,
                onRetry = onRetry,
                onStatusClick = onStatusClick,
                onPlanFreeWindow = onPlanFreeWindow,
            )
        }
    }
}

/** Mantém o carrossel e o dia escolhido juntos: o swipe escolhe o dia, e escolher um dia leva o carrossel até ele. */
@Composable
private fun DaySwipeSync(
    pager: PagerState,
    anchorDay: String,
    selectedDay: String,
    onSwipeSettled: (String) -> Unit,
) {
    LaunchedEffect(selectedDay) {
        val target = pageOf(anchorDay, selectedDay)
        when {
            pager.currentPage == target -> Unit
            abs(pager.currentPage - target) <= SMOOTH_SCROLL_MAX_DAYS -> pager.animateScrollToPage(target)
            else -> pager.scrollToPage(target)
        }
    }
    LaunchedEffect(pager) {
        snapshotFlow { pager.settledPage }.collect { onSwipeSettled(dayKeyAt(anchorDay, it)) }
    }
}

private const val CENTER_PAGE = DAYS_EACH_SIDE

private fun pageOf(
    anchorDay: String,
    dayKey: String,
): Int = (CENTER_PAGE + daysBetween(anchorDay, dayKey)).coerceIn(0, PAGE_COUNT - 1)

private fun dayKeyAt(
    anchorDay: String,
    page: Int,
): String = shiftDayKey(anchorDay, page - CENTER_PAGE)
