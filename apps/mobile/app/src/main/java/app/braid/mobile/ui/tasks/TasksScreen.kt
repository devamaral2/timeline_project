package app.braid.mobile.ui.tasks

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.task.SubtaskTree
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskGroup
import app.braid.mobile.domain.task.TaskGroupKey
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.showsSeriesRule
import app.braid.mobile.ui.agenda.ListSkeleton
import app.braid.mobile.ui.shell.MainTab
import app.braid.mobile.ui.shell.PublishSectionMenu
import app.braid.mobile.ui.shell.SectionChoice
import app.braid.mobile.ui.shell.SectionList
import app.braid.mobile.ui.shell.SectionMenuModel
import app.braid.mobile.ui.shell.SectionSearch
import app.braid.mobile.ui.shell.SectionSetting
import java.time.Instant

/** "9 tarefas abertas": a legenda em mono no topo da tela. */
fun openTasksLabel(open: Int): String =
    when (open) {
        0 -> "Nenhuma tarefa aberta"
        1 -> "1 tarefa aberta"
        else -> "$open tarefas abertas"
    }

/** A lista de Tarefas: as tarefas com status, de pessoa e de agente, nos grupos por status. */
@Composable
fun TasksScreen(
    onNewTask: () -> Unit,
    onOpenTask: (String) -> Unit = {},
    viewModel: TasksViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // O primeiro ON_RESUME é o de abrir a tela, e o ViewModel já leu a lista ao nascer.
    var firstResume by remember { mutableStateOf(true) }
    LifecycleResumeEffect(Unit) {
        if (firstResume) firstResume = false else viewModel.onResume()
        // A releitura das tarefas de agente abertas só anda com a tela à vista.
        viewModel.setVisible(true)
        onPauseOrDispose { viewModel.setVisible(false) }
    }
    TasksContent(
        state = state,
        onStatusClick = viewModel::openStatusPicker,
        onToggleGroup = viewModel::toggleGroup,
        onToggleSubtasks = viewModel::toggleSubtasks,
        onRetry = viewModel::retry,
        onClearFilters = viewModel::clearFilters,
        onNewTask = onNewTask,
        onOpenTask = onOpenTask,
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
    // O menu da seção (tocar de novo na aba Tarefas): uma lista por tag, a busca e, na engrenagem, a prioridade.
    PublishSectionMenu(
        tab = MainTab.Tasks,
        model =
            SectionMenuModel(
                count = if (state.cards != null) state.openCount else null,
                lists =
                    state.tags.map { name ->
                        SectionList(
                            id = "tag:$name",
                            name = name,
                            description = "#$name",
                            icon = BraidIcons.hash,
                            count = state.tagCounts[name] ?: 0,
                            selected = state.tag == name,
                            onPick = { viewModel.toggleTag(name) },
                        )
                    },
                search = SectionSearch(label = "Buscar nas tarefas", value = state.typed, onChange = viewModel::search),
                settings =
                    listOf(
                        SectionSetting.Toggles(
                            label = "Prioridade",
                            options =
                                TaskPriority.entries.map { level ->
                                    SectionChoice(
                                        label = level.label,
                                        selected = level in state.priorities,
                                        onPick = { viewModel.togglePriority(level) },
                                    )
                                },
                        ),
                    ),
                filtered = state.filters.count > 0,
                onClear = viewModel::clearFilters,
            ),
    )
}

@Composable
fun TasksContent(
    state: TasksUiState,
    onStatusClick: (TaskCard) -> Unit,
    onToggleGroup: (TaskGroupKey) -> Unit,
    onToggleSubtasks: (String) -> Unit,
    onRetry: () -> Unit,
    onClearFilters: () -> Unit,
    onNewTask: () -> Unit,
    onOpenTask: (String) -> Unit = {},
) {
    val bottomInset = with(LocalDensity.current) { WindowInsets.navigationBars.getBottom(this).toDp() }
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars),
    ) {
        Text(
            text = (if (state.cards != null) openTasksLabel(state.openCount) else "Tarefas").uppercase(),
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 10.dp).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
        state.notice?.let { notice ->
            Text(
                text = notice,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp).semantics { liveRegion = LiveRegionMode.Assertive },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
        }
        Column(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 120.dp + bottomInset),
        ) {
            val groups = state.groups
            when {
                state.failed -> LoadFailed(onRetry)
                state.cards == null -> LoadingList()
                groups.isEmpty() ->
                    if (state.filters.count > 0) {
                        EmptyList(
                            title = "Nenhuma tarefa passou no filtro",
                            text = "Nada combina com os filtros escolhidos.",
                            action = "Limpar filtros",
                            onAction = onClearFilters,
                        )
                    } else {
                        EmptyList(
                            title = "Nenhuma tarefa por aqui",
                            text = "Crie a primeira tarefa para começar a organizar o seu dia.",
                            action = "Nova tarefa",
                            onAction = onNewTask,
                        )
                    }
                else ->
                    groups.forEach { group ->
                        GroupSection(
                            group = group,
                            tree = state.tree,
                            closedSubtasks = state.closedSubtasks,
                            expanded = state.isExpanded(group),
                            now = state.now,
                            onToggle = { onToggleGroup(group.key) },
                            onToggleSubtasks = onToggleSubtasks,
                            onStatusClick = onStatusClick,
                            onOpenTask = onOpenTask,
                        )
                    }
            }
        }
    }
}

/** O hairline entre as linhas começa depois do glifo, como no web. */
private val ROW_DIVIDER_INSET = 58.dp

@Composable
private fun GroupSection(
    group: TaskGroup,
    tree: SubtaskTree,
    closedSubtasks: Set<String>,
    expanded: Boolean,
    now: Instant,
    onToggle: () -> Unit,
    onToggleSubtasks: (String) -> Unit,
    onStatusClick: (TaskCard) -> Unit,
    onOpenTask: (String) -> Unit,
) {
    if (group.collapsedByDefault) {
        CollapsibleHead(group, expanded, onToggle)
    } else {
        GroupHead(group.title, group.cards.size, Modifier.padding(top = 18.dp, bottom = 4.dp))
    }
    if (expanded) {
        group.cards.forEachIndexed { index, card ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = ROW_DIVIDER_INSET), color = MaterialTheme.colorScheme.outline)
            // O glifo de uma tarefa de pessoa, com qualquer status, abre a folha; o de agente é só leitura.
            val opensPicker = card.actor == TaskActor.Human
            val subtasks = tree.subtasksOf(card.id)
            val drawerOpen = card.id !in closedSubtasks
            TaskRow(
                card = card,
                now = now,
                onClick = { onOpenTask(card.id) },
                onStatusClick = if (opensPicker) ({ onStatusClick(card) }) else null,
                ruleInPlaceOfTime = showsSeriesRule(card),
                aside =
                    if (subtasks.isEmpty()) {
                        null
                    } else {
                        { SubtaskToggle(card = card, subtasks = subtasks, expanded = drawerOpen, onToggle = { onToggleSubtasks(card.id) }) }
                    },
            )
            if (subtasks.isNotEmpty() && drawerOpen) {
                SubtaskDrawer(
                    parent = card,
                    tree = tree,
                    now = now,
                    closedIds = closedSubtasks,
                    onToggle = onToggleSubtasks,
                    onStatusClick = onStatusClick,
                    onOpenTask = onOpenTask,
                    modifier = Modifier.padding(start = 12.dp, top = 2.dp, bottom = 8.dp),
                )
            }
        }
    }
}

/** O rótulo de seção: a legenda em mono, a contagem mais clara e um fio até a margem. */
@Composable
private fun GroupHead(
    title: String,
    count: Int,
    modifier: Modifier = Modifier,
    leading: @Composable (() -> Unit)? = null,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        leading?.invoke()
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = title.uppercase(),
                color = muted,
                fontFamily = BraidMonoFont,
                fontWeight = FontWeight.Medium,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.08.em,
            )
            Text(
                text = count.toString(),
                color = muted.copy(alpha = 0.7f),
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
        HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline)
    }
}

/** Feitas e Encerradas: o cabeçalho é um botão que abre e fecha o grupo. */
@Composable
private fun CollapsibleHead(
    group: TaskGroup,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    GroupHead(
        title = group.title,
        count = group.cards.size,
        modifier =
            Modifier
                .defaultMinSize(minHeight = 44.dp)
                .semantics(mergeDescendants = true) {
                    heading()
                    stateDescription = if (expanded) "Aberto" else "Recolhido"
                    onClick(label = if (expanded) "Recolher ${group.title}" else "Abrir ${group.title}") {
                        onToggle()
                        true
                    }
                }.clickable(role = Role.Button, onClick = onToggle),
        leading = {
            SvgIcon(
                if (expanded) BraidIcons.chevronDown else BraidIcons.chevronRight,
                size = 14.dp,
                color = muted,
                strokeWidth = 2f,
                modifier = Modifier.clearAndSetSemantics {},
            )
        },
    )
}

@Composable
private fun LoadingList() {
    Column {
        ListSkeleton()
        Text(
            text = "Carregando tarefas…",
            modifier = Modifier.padding(top = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
    }
}

@Composable
private fun LoadFailed(onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = "Não foi possível carregar as tarefas.",
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        BraidPill(text = "Tentar de novo", onClick = onRetry)
    }
}

/** O estado vazio do web: caixa tracejada com o ícone, o título, o texto e um botão. */
@Composable
private fun EmptyList(
    title: String,
    text: String,
    action: String,
    onAction: () -> Unit,
) {
    val dash = MaterialTheme.colorScheme.outline
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .drawBehind {
                    val stroke = 1.dp.toPx()
                    drawRoundRect(
                        color = dash,
                        cornerRadius = CornerRadius(14.dp.toPx()),
                        style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx()))),
                    )
                }.padding(horizontal = 24.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SvgIcon(BraidIcons.listChecks, size = 32.dp, color = muted, strokeWidth = 2f, modifier = Modifier.clearAndSetSemantics {})
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = text,
            modifier = Modifier.widthIn(max = 280.dp),
            color = muted,
            fontSize = 13.sp,
            lineHeight = 21.sp,
            textAlign = TextAlign.Center,
        )
        BraidPill(text = action, onClick = onAction)
    }
}
