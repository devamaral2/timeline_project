package app.braid.mobile.ui.taskdetail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.EDIT_LISTENING_TEXT
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.PreviousRequest
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.RequestStep
import app.braid.mobile.domain.request.TraceEntry
import app.braid.mobile.domain.request.entityKindLabel
import app.braid.mobile.domain.request.entityOperationLabel
import app.braid.mobile.domain.request.entryText
import app.braid.mobile.domain.request.stepProgress
import app.braid.mobile.domain.request.traceKindName
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.elapsedLabel
import app.braid.mobile.domain.task.momentLabel
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.ui.aiedit.MicrophonePermissionEffect
import app.braid.mobile.ui.chat.VoiceButton
import app.braid.mobile.ui.chat.VoiceUiState
import app.braid.mobile.ui.tasks.TaskKindMark
import app.braid.mobile.ui.tasks.TaskStatusGlyph
import app.braid.mobile.ui.tasks.taskStatusName
import java.time.Instant

/** O detalhe da tarefa de agente: o pedido, os passos, o que ele produziu e o rodapé para continuar ou cancelar. */
@Composable
fun AgentTaskPage(
    onBack: () -> Unit,
    onOpenTask: (String) -> Unit,
    onOpenArtifact: (String) -> Unit,
    viewModel: AgentTaskViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val voice by viewModel.voice.collectAsStateWithLifecycle()
    // A resposta do sistema volta ao ViewModel, que liga a escuta ou explica.
    MicrophonePermissionEffect(voice.askPermission, viewModel::microphoneResult)
    // A releitura do pedido aberto só anda com a tela à vista (e o microfone desliga fora dela).
    LifecycleResumeEffect(Unit) {
        viewModel.setVisible(true)
        onPauseOrDispose { viewModel.setVisible(false) }
    }
    AgentTaskScreen(
        state = state,
        voice = voice,
        onBack = onBack,
        onRetry = viewModel::retry,
        onOpenTask = onOpenTask,
        onOpenArtifact = onOpenArtifact,
        onDraftChange = viewModel::onDraftChange,
        onSend = viewModel::send,
        onCancel = viewModel::cancel,
        onToggleVoice = viewModel::toggleVoice,
    )
}

@Composable
fun AgentTaskScreen(
    state: AgentTaskUiState,
    voice: VoiceUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onOpenTask: (String) -> Unit,
    onOpenArtifact: (String) -> Unit,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancel: () -> Unit,
    onToggleVoice: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars),
    ) {
        TopBar(onBack = onBack, onEdit = null, onDelete = null)
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            when (state) {
                AgentTaskUiState.Loading -> Message("Carregando pedido…")
                is AgentTaskUiState.Missing -> Message(state.message, alert = true)
                is AgentTaskUiState.Failed -> {
                    Message(state.message, alert = true)
                    BraidPill(text = "Tentar de novo", onClick = onRetry)
                }
                is AgentTaskUiState.Content -> Body(state, onOpenTask, onOpenArtifact)
            }
        }
        if (state is AgentTaskUiState.Content) {
            RequestBar(state, voice, onDraftChange, onSend, onCancel, onToggleVoice)
        }
    }
}

@Composable
private fun Body(
    content: AgentTaskUiState.Content,
    onOpenTask: (String) -> Unit,
    onOpenArtifact: (String) -> Unit,
) {
    val request = content.request
    Header(content.task, request)
    InfoSection(content.task, content.now)
    content.parent?.let {
        LinkedSection("Tarefa principal", "Carregando tarefa principal…", "A tarefa principal não carregou.", it, content.now, onOpenTask)
    }
    content.subtasks?.let {
        LinkedSection("Subtarefas", "Carregando subtarefas…", "Algumas subtarefas não carregaram.", it, content.now, onOpenTask)
    }
    EntriesSection(request.entries)
    StepsSection(request.steps)
    ProducedSection(request.entities, onOpenTask, onOpenArtifact)
    SessionSection(content.previous, onOpenTask)
    RecordSection(request)
    if (request.status == TaskStatus.Failed) FailureSection(content.requestFailure)
}

/** O topo: o código do tipo, o título e o status do agente, solto na linha, com o robô na ponta como assinatura. */
@Composable
private fun Header(
    task: TaskDetail,
    request: AgentRequest,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TaskKindMark(task.card.kind)
        Text(
            text = task.card.name,
            color = MaterialTheme.colorScheme.onBackground,
            style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Normal, lineHeight = 36.sp),
        )
        Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = 40.dp), verticalAlignment = Alignment.CenterVertically) {
            TaskStatusGlyph(actor = TaskActor.Agent, status = request.status, size = 16.dp)
            Spacer(Modifier.width(8.dp))
            Text(
                taskStatusName(TaskActor.Agent, request.status),
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            Spacer(Modifier.weight(1f))
            SvgIcon(
                BraidIcons.bot,
                size = 20.dp,
                color = braidTokens().brand,
                strokeWidth = 1.9f,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}

/** "Informações": o início, com o tempo decorrido, e a conclusão, ou "ainda não concluído". */
@Composable
private fun InfoSection(
    task: TaskDetail,
    now: Instant,
) {
    Section("Informações") {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            FactRow("Início") {
                val startedAt = task.card.startedAt
                if (startedAt == null) {
                    FactText("sem data")
                } else {
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        FactText(momentLabel(startedAt))
                        Text(
                            elapsedLabel(startedAt, now),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                        )
                    }
                }
            }
            FactRow("Concluído") { FactText(task.finishedAt?.let(::momentLabel) ?: "ainda não concluído") }
        }
    }
}

/** "Entradas": o rastro em ordem, cada entrada com o tipo, a origem, a hora e o texto. Sem entradas a seção não aparece. */
@Composable
private fun EntriesSection(entries: List<TraceEntry>) {
    if (entries.isEmpty()) return
    Section("Entradas", count = entries.size.toString()) {
        Column {
            entries.forEachIndexed { index, entry ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                EntryRow(entry)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EntryRow(entry: TraceEntry) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                traceKindName(entry.kind),
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.SemiBold,
            )
            entry.source?.let { Text(it, color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp) }
            entry.startedAt?.let { Text(formatTime(it), color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp) }
        }
        Text(entryText(entry), color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp)
    }
}

/** "Passos": cada um com o agente interno e o status; a contagem "feitos/total" vai ao lado do título. */
@Composable
private fun StepsSection(steps: List<RequestStep>) {
    val progress = stepProgress(steps)
    Section("Passos", count = "${progress.done}/${progress.total}") {
        if (steps.isEmpty()) {
            Text("Ainda não há passos.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 20.sp)
        } else {
            Column {
                steps.forEachIndexed { index, step ->
                    if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    StepRow(step)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StepRow(step: RequestStep) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.size(width = 20.dp, height = 20.dp), contentAlignment = Alignment.Center) {
            TaskStatusGlyph(actor = TaskActor.Agent, status = step.status, size = 16.dp)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(step.label, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(step.agent, color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp)
                Text(taskStatusName(TaskActor.Agent, step.status), color = muted, fontSize = 12.sp, lineHeight = 18.sp)
            }
        }
    }
}

/** "Produziu": o que o pedido criou, alterou ou apagou. Tocar num que ainda existe abre o detalhe; o apagado é só leitura. */
@Composable
private fun ProducedSection(
    entities: List<RequestEntity>,
    onOpenTask: (String) -> Unit,
    onOpenArtifact: (String) -> Unit,
) {
    if (entities.isEmpty()) return
    Section("Produziu", count = entities.size.toString()) {
        Column {
            entities.forEachIndexed { index, entity ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                val open: (() -> Unit)? =
                    when {
                        entity.operation == RequestOperation.Delete -> null
                        entity.kind == EntityKind.Task -> ({ onOpenTask(entity.id) })
                        else -> ({ onOpenArtifact(entity.id) })
                    }
                ProducedRow(entity, open)
            }
        }
    }
}

@Composable
private fun ProducedRow(
    entity: RequestEntity,
    onClick: (() -> Unit)?,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.size(width = 20.dp, height = 24.dp), contentAlignment = Alignment.Center) {
            SvgIcon(
                if (entity.kind == EntityKind.Task) BraidIcons.calendarDays else BraidIcons.fileText,
                size = 18.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                strokeWidth = 1.75f,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                entity.name,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "${entityOperationLabel(entity.operation)} · ${entityKindLabel(entity)}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
    }
}

/** "Sessão": de qual pedido este continua; tocar abre o detalhe dele. Sem sessão a seção não aparece. */
@Composable
private fun SessionSection(
    previous: PreviousRequest,
    onOpenTask: (String) -> Unit,
) {
    if (previous == PreviousRequest.None) return
    Section("Sessão") {
        when (previous) {
            PreviousRequest.None -> Unit
            PreviousRequest.Loading ->
                Text(
                    "Carregando pedido anterior…",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            PreviousRequest.NotFound ->
                Text(
                    "Pedido anterior não encontrado.",
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            is PreviousRequest.Found ->
                Column {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    FactRow("Continua de") {
                        Column(
                            Modifier.clickable(role = Role.Button) { onOpenTask(previous.id) },
                            horizontalAlignment = Alignment.End,
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            FactText(previous.title)
                            Text(
                                momentLabel(previous.createdAt),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 13.sp,
                                lineHeight = 20.sp,
                            )
                        }
                    }
                }
        }
    }
}

@Composable
private fun RecordSection(request: AgentRequest) {
    Section("Registro") {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            FactRow("Criado em") { FactText(momentLabel(request.createdAt)) }
            FactRow("Última alteração") { FactText(momentLabel(request.updatedAt)) }
        }
    }
}

@Composable
private fun FailureSection(reason: String) {
    Section("Falha") { Message(reason, alert = true) }
}

/**
 * O rodapé: a linha de status do pedido que a tela acompanha (com "Cancelar pedido" enquanto está aberto), o cartão
 * com o pedido e o campo para responder ou pedir uma mudança, que continua a mesma sessão.
 */
@Composable
private fun RequestBar(
    content: AgentTaskUiState.Content,
    voice: VoiceUiState,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancel: () -> Unit,
    onToggleVoice: () -> Unit,
) {
    val composer = content.composer
    val tracked = content.tracked
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxWidth()
            .background(scheme.background)
            .navigationBarsPadding()
            .imePadding()
            .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        composer.error?.let { Alert(it) }
        content.followFailure?.let { Alert(it) }
        voice.notice?.let { Alert(it) }
        Row(
            Modifier.fillMaxWidth().defaultMinSize(minHeight = 28.dp).padding(start = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SvgIcon(
                BraidIcons.bot,
                size = 18.dp,
                color = if (tracked?.status == TaskStatus.Failed) scheme.error else braidTokens().brand,
                strokeWidth = 1.9f,
                modifier = Modifier.clearAndSetSemantics {},
            )
            Spacer(Modifier.width(12.dp))
            Text(
                if (voice.listening) EDIT_LISTENING_TEXT else content.statusLine,
                modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite },
                color = if (tracked?.status == TaskStatus.Failed) scheme.error else scheme.onSurfaceVariant,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            if (content.canCancel) {
                Box(
                    Modifier
                        .defaultMinSize(minHeight = 48.dp)
                        .alpha(if (composer.cancelling) DISABLED_ALPHA else 1f)
                        .clickable(enabled = !composer.cancelling, role = Role.Button, onClick = onCancel)
                        .padding(horizontal = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Cancelar pedido", color = scheme.error, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Column(
            Modifier.fillMaxWidth().border(1.dp, scheme.outline, RoundedCornerShape(CARD_RADIUS)),
        ) {
            tracked?.let { ContextCard(it) }
            DraftField(
                composer.draft,
                enabled = tracked != null && !composer.sending,
                canSend = content.canSend,
                sending = composer.sending,
                voice = voice,
                onDraftChange = onDraftChange,
                onSend = onSend,
                onToggleVoice = onToggleVoice,
            )
        }
    }
}

private const val DISABLED_ALPHA = 0.55f
private val CARD_RADIUS = 22.dp

@Composable
private fun Alert(text: String) {
    Text(
        text,
        modifier = Modifier.padding(horizontal = 6.dp).semantics { liveRegion = LiveRegionMode.Assertive },
        color = MaterialTheme.colorScheme.error,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )
}

/** O pedido a que o campo responde: "Pedido · quando" e o título. */
@Composable
private fun ContextCard(request: AgentRequest) {
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).padding(start = 6.dp, end = 16.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            SvgIcon(
                BraidIcons.messageSquare,
                size = 20.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                strokeWidth = 1.75f,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
        Column(Modifier.weight(1f)) {
            Text(
                "Pedido · ${momentLabel(request.createdAt)}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                request.title,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun DraftField(
    draft: String,
    enabled: Boolean,
    canSend: Boolean,
    sending: Boolean,
    voice: VoiceUiState,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onToggleVoice: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val ready = canSend && draft.isNotBlank()
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (focused) Modifier.border(1.dp, braidBrand(), RoundedCornerShape(CARD_RADIUS)) else Modifier)
            .padding(start = 12.dp, end = 4.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        BasicTextField(
            value = draft,
            onValueChange = onDraftChange,
            enabled = enabled,
            interactionSource = interaction,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = scheme.onBackground, fontSize = 15.sp, lineHeight = 22.sp),
            cursorBrush = SolidColor(braidBrand()),
            maxLines = MAX_COMPOSER_LINES,
            modifier =
                Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Pedir à IA para editar este pedido" },
            decorationBox = { inner ->
                Box(Modifier.defaultMinSize(minHeight = 44.dp).padding(vertical = 11.dp), contentAlignment = Alignment.CenterStart) {
                    if (draft.isEmpty()) {
                        Text(
                            "Responda ou peça uma mudança",
                            color = scheme.onSurfaceVariant.copy(alpha = PLACEHOLDER_ALPHA),
                            fontSize = 15.sp,
                            lineHeight = 22.sp,
                        )
                    }
                    inner()
                }
            },
        )
        if (voice.available) {
            Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                VoiceButton(listening = voice.listening, enabled = enabled, onClick = onToggleVoice)
            }
        }
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .then(
                    if (ready) {
                        Modifier.background(scheme.primary)
                    } else {
                        Modifier.border(1.dp, scheme.outline, CircleShape)
                    },
                ).clickable(enabled = ready, role = Role.Button, onClick = onSend)
                .semantics { contentDescription = if (sending) "Aguardando a resposta" else "Enviar pedido" },
            contentAlignment = Alignment.Center,
        ) {
            SvgIcon(
                BraidIcons.arrowUp,
                size = 20.dp,
                color = if (ready) scheme.onPrimary else scheme.outline,
                strokeWidth = 2f,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}

private const val MAX_COMPOSER_LINES = 5
private const val PLACEHOLDER_ALPHA = 0.7f
