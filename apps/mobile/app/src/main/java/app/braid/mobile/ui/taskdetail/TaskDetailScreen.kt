package app.braid.mobile.ui.taskdetail

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
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
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.task.RequestRelation
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskRequest
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.cardWhenLabel
import app.braid.mobile.domain.task.mapsGeoUri
import app.braid.mobile.domain.task.mapsUrl
import app.braid.mobile.domain.task.momentLabel
import app.braid.mobile.domain.task.taskInfo
import app.braid.mobile.ui.aiedit.AiEditContext
import app.braid.mobile.ui.aiedit.EntityEditBar
import app.braid.mobile.ui.taskartifacts.ArtifactPickerSheet
import app.braid.mobile.ui.taskartifacts.TaskArtifactsSection
import app.braid.mobile.ui.taskedit.TaskEditIcons
import app.braid.mobile.ui.tasks.TaskKindMark
import app.braid.mobile.ui.tasks.TaskPriorityMark
import app.braid.mobile.ui.tasks.TaskPrioritySheet
import app.braid.mobile.ui.tasks.TaskStatusGlyph
import app.braid.mobile.ui.tasks.TaskStatusSheet
import app.braid.mobile.ui.tasks.taskStatusName
import java.time.Instant

@Composable
fun TaskDetailPage(
    onBack: () -> Unit,
    onOpenTask: (String) -> Unit,
    onOpenArtifact: (String) -> Unit = {},
    onEdit: (String) -> Unit = {},
    viewModel: TaskDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // A tarefa de agente tem o próprio detalhe: o pedido, a sessão e o rodapé de continuar e cancelar.
    if ((state as? TaskDetailUiState.Content)?.task?.actor == TaskActor.Agent) {
        AgentTaskPage(onBack = onBack, onOpenTask = onOpenTask, onOpenArtifact = onOpenArtifact)
        return
    }
    val deleted = (state as? TaskDetailUiState.Content)?.deleted == true
    LaunchedEffect(deleted) { if (deleted) onBack() }
    // Voltar do formulário de edição (ou de outra tela) relê a tarefa; o primeiro ON_RESUME é o de abrir a tela.
    var resumedOnce by remember { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        if (resumedOnce) viewModel.reload() else resumedOnce = true
        onPauseOrDispose {}
    }
    TaskDetailScreen(
        state = state,
        onBack = onBack,
        onEdit = { (state as? TaskDetailUiState.Content)?.task?.id?.let(onEdit) },
        onRetry = viewModel::retry,
        onOpenTask = onOpenTask,
        onChangeStatus = viewModel::changeStatus,
        onChangePriority = viewModel::changePriority,
        onAskDelete = viewModel::askDelete,
        onDismissDelete = viewModel::dismissDelete,
        onConfirmDelete = viewModel::confirmDelete,
        onOpenArtifact = onOpenArtifact,
        onAddArtifact = viewModel::openArtifactPicker,
        footer =
            (state as? TaskDetailUiState.Content)?.let { content ->
                {
                    EntityEditBar(
                        entityType = EditEntityType.Task,
                        entityId = content.task.id,
                        context =
                            AiEditContext(
                                icon = BraidIcons.taskKind(content.task.card.kind.code),
                                meta =
                                    content.task.card.startedAt
                                        ?.let { "Tarefa · ${momentLabel(it)}" } ?: "Tarefa",
                                title = content.task.card.name,
                            ),
                        onEdited = viewModel::reload,
                    )
                }
            },
    )
    val picker by viewModel.artifactPicker.state.collectAsStateWithLifecycle()
    picker?.let {
        ArtifactPickerSheet(
            it,
            onType = viewModel.artifactPicker::type,
            onPick = viewModel.artifactPicker::pick,
            onClose = viewModel.artifactPicker::close,
        )
    }
}

@Composable
fun TaskDetailScreen(
    state: TaskDetailUiState,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onRetry: () -> Unit,
    onOpenTask: (String) -> Unit,
    onChangeStatus: (TaskStatus) -> Unit,
    onChangePriority: (TaskPriority) -> Unit,
    onAskDelete: () -> Unit,
    onDismissDelete: () -> Unit,
    onConfirmDelete: () -> Unit,
    onOpenArtifact: (String) -> Unit = {},
    /** O "+" da seção Documentos: abre o seletor do tipo da tarefa e grava a escolha na hora. */
    onAddArtifact: () -> Unit = {},
    /** A barra de edição por IA, fixa no pé da tela. */
    footer: (@Composable () -> Unit)? = null,
) {
    val content = state as? TaskDetailUiState.Content
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars),
    ) {
        TopBar(onBack = onBack, onEdit = if (content != null) onEdit else null, onDelete = if (content != null) onAskDelete else null)
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 24.dp)
                .then(if (footer == null) Modifier.navigationBarsPadding() else Modifier),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            when (state) {
                TaskDetailUiState.Loading -> Message("Carregando tarefa…")
                TaskDetailUiState.Missing -> Message("Tarefa não encontrada.", alert = true)
                TaskDetailUiState.Failed -> {
                    Message("Não foi possível carregar a tarefa. Tente novamente.", alert = true)
                    BraidPill(text = "Tentar de novo", onClick = onRetry)
                }
                is TaskDetailUiState.Content -> Body(state, onOpenTask, onOpenArtifact, onAddArtifact, onChangeStatus, onChangePriority)
            }
        }
        footer?.invoke()
    }
    if (content != null && content.delete.open) {
        DeleteDialog(content.task.card.name, content.delete, onDismissDelete, onConfirmDelete, onGone = onBack)
    }
}

@Composable
internal fun TopBar(
    onBack: () -> Unit,
    onEdit: (() -> Unit)?,
    onDelete: (() -> Unit)?,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onBack).semantics {
                contentDescription = "Voltar"
            },
            contentAlignment = Alignment.Center,
        ) {
            SvgIcon(
                DetailIcons.arrowLeft,
                size = 20.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier =
                    Modifier
                        .clearAndSetSemantics {
                        },
            )
        }
        Text(
            text = "TAREFA",
            modifier = Modifier.weight(1f).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.1.em,
            textAlign = TextAlign.Center,
        )
        Box(contentAlignment = Alignment.Center) {
            if (onDelete != null) {
                Box(
                    Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button) { menuOpen = true }.semantics {
                        contentDescription = "Mais ações"
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    SvgIcon(
                        DetailIcons.ellipsisVertical,
                        size = 20.dp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier =
                            Modifier
                                .clearAndSetSemantics {
                                },
                    )
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    if (onEdit != null) {
                        DropdownMenuItem(
                            text = { Text("Editar", fontSize = 14.sp) },
                            leadingIcon = {
                                SvgIcon(
                                    TaskEditIcons.pencil,
                                    size = 18.dp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            onClick = {
                                menuOpen = false
                                onEdit()
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Excluir", color = MaterialTheme.colorScheme.error, fontSize = 14.sp) },
                        leadingIcon = { SvgIcon(DetailIcons.trash, size = 18.dp, color = MaterialTheme.colorScheme.error) },
                        onClick = {
                            menuOpen = false
                            onDelete()
                        },
                    )
                }
            } else {
                Spacer(Modifier.size(48.dp))
            }
        }
    }
}

@Composable
internal fun Message(
    text: String,
    alert: Boolean = false,
) {
    Text(
        text = text,
        modifier =
            Modifier.padding(vertical = 28.dp).semantics {
                liveRegion =
                    if (alert) LiveRegionMode.Assertive else LiveRegionMode.Polite
            },
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )
}

@Composable
private fun Body(
    content: TaskDetailUiState.Content,
    onOpenTask: (String) -> Unit,
    onOpenArtifact: (String) -> Unit,
    onAddArtifact: () -> Unit,
    onChangeStatus: (TaskStatus) -> Unit,
    onChangePriority: (TaskPriority) -> Unit,
) {
    val task = content.task
    Header(content, onChangeStatus, onChangePriority)
    content.notice?.let { notice ->
        Text(
            text = notice,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            color = MaterialTheme.colorScheme.error,
            fontSize = 13.sp,
            lineHeight = 18.sp,
        )
    }
    InfoSection(task)
    content.parent?.let {
        LinkedSection("Tarefa principal", "Carregando tarefa principal…", "A tarefa principal não carregou.", it, content.now, onOpenTask)
    }
    content.subtasks?.let {
        LinkedSection("Subtarefas", "Carregando subtarefas…", "Algumas subtarefas não carregaram.", it, content.now, onOpenTask)
    }
    TaskArtifactsSection(task.card.kind, task.artifacts, onOpenArtifact, onAdd = onAddArtifact, busy = content.saving)
    RequestsSection(task.requests, onOpenTask)
}

@Composable
private fun Header(
    content: TaskDetailUiState.Content,
    onChangeStatus: (TaskStatus) -> Unit,
    onChangePriority: (TaskPriority) -> Unit,
) {
    val task = content.task
    var statusOpen by rememberSaveable { mutableStateOf(false) }
    var priorityOpen by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TaskKindMark(task.card.kind)
        Text(
            text = task.card.name,
            color = MaterialTheme.colorScheme.onBackground,
            style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Normal, lineHeight = 36.sp),
        )
        if (task.hasHumanControls) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                val statusName = taskStatusName(TaskActor.Human, task.status)
                ChoiceChip(
                    description = "Status: $statusName. Trocar status de ${task.card.name}",
                    enabled = !content.saving,
                    onClick = { statusOpen = true },
                ) {
                    TaskStatusGlyph(actor = TaskActor.Human, status = task.status, size = 18.dp)
                    Text(statusName, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp)
                }
                Spacer(Modifier.weight(1f))
                ChoiceChip(
                    description = "Prioridade: ${task.priority.label}. Trocar prioridade de ${task.card.name}",
                    enabled = !content.saving,
                    onClick = { priorityOpen = true },
                ) {
                    TaskPriorityMark(task.priority)
                    Text(task.priority.label, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp)
                }
            }
        }
    }
    if (statusOpen) {
        TaskStatusSheet(
            taskName = task.card.name,
            longRunning = task.card.longRunning,
            current = task.status,
            onPick = {
                statusOpen = false
                onChangeStatus(it)
            },
            onDismiss = { statusOpen = false },
        )
    }
    if (priorityOpen) {
        TaskPrioritySheet(
            taskName = task.card.name,
            current = task.priority,
            onPick = {
                priorityOpen = false
                onChangePriority(it)
            },
            onDismiss = { priorityOpen = false },
        )
    }
}

/** O botão de escolha do topo: o glifo e o nome com a seta, sem moldura, com a área de toque de 48dp. */
@Composable
private fun ChoiceChip(
    description: String,
    enabled: Boolean,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Row(
        Modifier
            .defaultMinSize(minHeight = 48.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 4.dp)
            .semantics { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        content()
        SvgIcon(
            BraidIcons.chevronDown,
            size = 14.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier =
                Modifier
                    .clearAndSetSemantics {
                    },
        )
    }
}

/** O rótulo de seção: a legenda em mono e um fio até a margem. */
@Composable
private fun SectionLabel(
    text: String,
    count: String? = null,
) {
    Row(Modifier.fillMaxWidth().semantics { heading() }, verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = text.uppercase(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontWeight = FontWeight.Medium,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
        if (count != null) {
            Spacer(Modifier.width(8.dp))
            Text(
                text = count,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
        Spacer(Modifier.width(12.dp))
        HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
internal fun Section(
    title: String,
    count: String? = null,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionLabel(title, count)
        content()
    }
}

/** Uma linha de fato: o rótulo à esquerda, o valor à direita, um fio embaixo. */
@Composable
internal fun FactRow(
    label: String,
    value: @Composable () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp).padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) { value() }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = HAIRLINE_ALPHA))
}

private const val HAIRLINE_ALPHA = 0.6f

@Composable
internal fun FactText(text: String) {
    Text(
        text = text,
        color = MaterialTheme.colorScheme.onBackground,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.Medium,
        textAlign = TextAlign.End,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InfoSection(task: TaskDetail) {
    val info = taskInfo(task)
    val context = LocalContext.current
    Section("Informações") {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            info.start?.let { FactRow("Início") { FactText(it) } }
            FactRow(info.endLabel) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    FactText(info.end)
                    info.duration?.let {
                        Text(
                            it,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontFamily = BraidMonoFont,
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                        )
                    }
                }
            }
            if (info.persistent) {
                FactRow("Tarefa persistente") {
                    // O ponto verde basta: só a tarefa persistente chega aqui.
                    Box(Modifier.size(8.dp).background(braidTokens().brand, CircleShape).semantics { contentDescription = "Sim" })
                }
            }
            info.recurrence?.let { recurrence ->
                FactRow("Recorrência") {
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        FactText(recurrence.rule)
                        Text(
                            recurrence.detail,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.End,
                        )
                    }
                }
            }
            info.location?.let { location ->
                FactRow("Local") { LocationLink(location) { openMap(context, location) } }
            }
            if (info.reminders.isNotEmpty()) {
                FactRow("Lembrar antes de") {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        info.reminders.forEach { FactText(it) }
                    }
                }
            }
            if (info.tags.isNotEmpty()) {
                FactRow("Tags") {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        info.tags.forEach { tag ->
                            Text(
                                "#$tag",
                                color = tagColors(tag).color,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
            }
        }
        info.description?.let { Description(it) }
    }
}

@Composable
private fun LocationLink(
    location: String,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .defaultMinSize(minHeight = 40.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = "$location (abre o mapa)" },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SvgIcon(
            DetailIcons.mapPin,
            size = 16.dp,
            color = MaterialTheme.colorScheme.onBackground,
            strokeWidth = 1.75f,
            modifier =
                Modifier
                    .clearAndSetSemantics {
                    },
        )
        Text(
            text = location,
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.Medium,
            textDecoration = TextDecoration.Underline,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}

/** Abre o local no mapa do Android; sem app que atenda o `geo:`, cai na mesma busca do Google Maps no navegador. */
internal fun openMap(
    context: Context,
    location: String,
) {
    for (uri in listOf(mapsGeoUri(location), mapsUrl(location))) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))
            return
        } catch (missing: ActivityNotFoundException) {
            continue
        }
    }
}

private const val CLAMP_LENGTH = 180
private const val CLAMP_LINES = 3

/** A descrição: texto corrido, com "Ler mais" quando passa de três linhas. */
@Composable
private fun Description(text: String) {
    var open by rememberSaveable { mutableStateOf(false) }
    val long = text.length > CLAMP_LENGTH || text.split("\n").size > CLAMP_LINES
    Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = "DESCRIÇÃO",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
        Text(
            text = text,
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 16.sp,
            lineHeight = 26.sp,
            maxLines = if (long && !open) CLAMP_LINES else Int.MAX_VALUE,
            overflow = TextOverflow.Ellipsis,
        )
        if (long) {
            Text(
                text = if (open) "Ler menos" else "Ler mais",
                modifier =
                    Modifier
                        .defaultMinSize(
                            minHeight = 44.dp,
                        ).clickable(role = Role.Button) { open = !open }
                        .padding(vertical = 10.dp),
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                textDecoration = TextDecoration.Underline,
            )
        }
    }
}

@Composable
internal fun LinkedSection(
    title: String,
    loadingMessage: String,
    failedMessage: String,
    linked: LinkedTasks,
    now: Instant,
    onOpenTask: (String) -> Unit,
) {
    Section(title) {
        if (linked.failed) {
            Text(
                failedMessage,
                modifier =
                    Modifier.semantics {
                        liveRegion = LiveRegionMode.Assertive
                    },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
        }
        val cards = linked.cards
        if (cards == null) {
            Text(
                loadingMessage,
                modifier =
                    Modifier.semantics {
                        liveRegion = LiveRegionMode.Polite
                    },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
        } else {
            cards.forEachIndexed { index, card ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                LinkedRow(card, now, onClick = { onOpenTask(card.id) })
            }
        }
    }
}

/** Uma tarefa ligada: o glifo só de leitura, o nome e, embaixo, o tipo e o quando; a linha toda abre o detalhe dela. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LinkedRow(
    card: TaskCard,
    now: Instant,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        TaskStatusGlyph(actor = card.actor, status = card.status, size = 20.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                card.name,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                TaskKindMark(card.kind)
                Text(cardWhenLabel(card, now), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
            }
        }
    }
}

private val REQUEST_GROUPS = listOf(RequestRelation.Generates to "Criado por", RequestRelation.Updates to "Atualizado por")

/** Os pedidos ao agente que criaram e alteraram a tarefa; sem pedido a seção não aparece, e com um lado só, só esse lado. */
@Composable
private fun RequestsSection(
    requests: List<TaskRequest>,
    onOpenTask: (String) -> Unit,
) {
    if (requests.isEmpty()) return
    Section("Pedidos") {
        REQUEST_GROUPS.forEach { (relation, label) ->
            val group = requests.filter { it.relation == relation }
            if (group.isNotEmpty()) {
                Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = label.uppercase(),
                        modifier = Modifier.semantics { heading() },
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontFamily = BraidMonoFont,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        letterSpacing = 0.08.em,
                    )
                    group.forEachIndexed { index, request ->
                        if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        RequestRow(request, onClick = { onOpenTask(request.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun RequestRow(
    request: TaskRequest,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.size(width = 20.dp, height = 24.dp), contentAlignment = Alignment.Center) {
            SvgIcon(
                BraidIcons.bot,
                size = 18.dp,
                color = braidTokens().success,
                strokeWidth = 1.75f,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                request.name,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(momentLabel(request.at), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
        }
    }
}

@Composable
private fun DeleteDialog(
    taskName: String,
    dialog: DeleteDialog,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    onGone: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (dialog.gone) onGone() else onDismiss() },
        containerColor = MaterialTheme.colorScheme.background,
        icon = { SvgIcon(DetailIcons.alertTriangle, size = 24.dp, color = MaterialTheme.colorScheme.error) },
        title = { Text("Excluir tarefa", style = MaterialTheme.typography.headlineSmall) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Tem certeza que deseja excluir “$taskName”? Essa ação não pode ser desfeita.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    lineHeight = 24.sp,
                )
                dialog.error?.let {
                    Text(
                        it,
                        modifier =
                            Modifier.semantics {
                                liveRegion = LiveRegionMode.Assertive
                            },
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                    )
                }
            }
        },
        dismissButton =
            if (dialog.gone) {
                null
            } else {
                {
                    TextButton(
                        onClick = onDismiss,
                        enabled = !dialog.running,
                    ) { Text("Cancelar", color = MaterialTheme.colorScheme.onBackground) }
                }
            },
        confirmButton = {
            if (dialog.gone) {
                TextButton(onClick = onGone) { Text("Voltar", color = MaterialTheme.colorScheme.onBackground) }
            } else {
                TextButton(onClick = onConfirm, enabled = !dialog.running) {
                    Text(if (dialog.running) "Excluindo..." else "Excluir", color = MaterialTheme.colorScheme.error)
                }
            }
        },
    )
}
