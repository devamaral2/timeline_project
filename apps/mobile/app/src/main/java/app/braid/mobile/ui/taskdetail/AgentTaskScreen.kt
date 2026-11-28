package app.braid.mobile.ui.taskdetail

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.core.designsystem.BraidPullToRefresh
import app.braid.mobile.core.designsystem.ProjectLine
import app.braid.mobile.core.designsystem.SvgIcon
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
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.elapsedLabel
import app.braid.mobile.domain.task.isOpenAgentStatus
import app.braid.mobile.domain.task.isSuccessAgentStatus
import app.braid.mobile.domain.task.momentLabel
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.ui.aiedit.MicrophonePermissionEffect
import app.braid.mobile.ui.chat.BotState
import app.braid.mobile.ui.chat.HermesComposer
import app.braid.mobile.ui.chat.HermesContextCard
import app.braid.mobile.ui.chat.HermesDraft
import app.braid.mobile.ui.chat.HermesSend
import app.braid.mobile.ui.chat.HermesStatusLine
import app.braid.mobile.ui.chat.VoiceButton
import app.braid.mobile.ui.chat.VoiceUiState
import app.braid.mobile.ui.documents.DocumentIcons
import app.braid.mobile.ui.tasks.TaskKindMark
import app.braid.mobile.ui.tasks.TaskSituationGlyph
import app.braid.mobile.ui.tasks.TaskSituationSheet
import app.braid.mobile.ui.tasks.TaskStatusGlyph
import app.braid.mobile.ui.tasks.agentStatusLabel
import app.braid.mobile.ui.tasks.situationName
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
        onRefresh = viewModel::pull,
        onOpenTask = onOpenTask,
        onOpenArtifact = onOpenArtifact,
        onDraftChange = viewModel::onDraftChange,
        onSend = viewModel::send,
        onCancel = viewModel::cancel,
        onSituationPick = viewModel::chooseSituation,
        onToggleVoice = viewModel::toggleVoice,
    )
}

@Composable
fun AgentTaskScreen(
    state: AgentTaskUiState,
    voice: VoiceUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onRefresh: () -> Unit,
    onOpenTask: (String) -> Unit,
    onOpenArtifact: (String) -> Unit,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancel: () -> Unit,
    onToggleVoice: () -> Unit,
    onSituationPick: (TaskSituation) -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars),
    ) {
        TopBar(onBack = onBack, onEdit = null, onDelete = null)
        // Puxar para recarregar: só com a tarefa lida; o erro tem o "Tentar de novo" e o esqueleto é a primeira leitura.
        BraidPullToRefresh(
            refreshing = (state as? AgentTaskUiState.Content)?.refreshing == true,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxWidth().weight(1f),
            enabled = state is AgentTaskUiState.Content,
        ) {
            Column(
                Modifier
                    .fillMaxSize()
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
                    is AgentTaskUiState.Content -> Body(state, onOpenTask, onOpenArtifact, onSituationPick)
                }
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
    onSituationPick: (TaskSituation) -> Unit,
) {
    val request = content.request
    // O aviso do puxar que falhou fica no topo, onde a pessoa puxou, na mesma linha de alerta do rodapé.
    content.pullNotice?.let { Alert(it) }
    Header(content.task, request, content.situationError, onSituationPick)
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

/**
 * O topo: o código do tipo, o título e o status do agente, solto na ponta direita da linha e só com o nome dele ("Concluído"). O pedido que terminou ganha o controle de situação na ponta esquerda, o mesmo botão do status de pessoa: o toque abre a folha das três.
 */
@Composable
private fun Header(
    task: TaskDetail,
    request: AgentRequest,
    situationError: String?,
    onSituationPick: (TaskSituation) -> Unit,
) {
    var situationOpen by remember { mutableStateOf(false) }
    val situation = request.situation
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TaskKindMark(task.card.kind)
        Text(
            text = task.card.name,
            color = MaterialTheme.colorScheme.onBackground,
            style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Normal, lineHeight = 36.sp),
        )
        Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = 40.dp), verticalAlignment = Alignment.CenterVertically) {
            if (situation != null) {
                ChoiceChip(
                    description = "${situationName(situation)}. Mudar situação",
                    enabled = true,
                    onClick = { situationOpen = true },
                ) {
                    TaskSituationGlyph(situation, size = 18.dp)
                    Text(situationName(situation), color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp)
                }
                Spacer(Modifier.width(12.dp))
            }
            Spacer(Modifier.weight(1f))
            TaskStatusGlyph(actor = TaskActor.Agent, status = request.status, size = 16.dp)
            Spacer(Modifier.width(8.dp))
            Text(
                agentStatusLabel(request.status) ?: "Agente",
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
        }
        if (situationOpen && situation != null) {
            TaskSituationSheet(
                taskName = task.card.name,
                current = situation,
                onPick = {
                    situationOpen = false
                    // Escolher a que já está não grava nada.
                    if (it != situation) onSituationPick(it)
                },
                onDismiss = { situationOpen = false },
            )
        }
        situationError?.let { Alert(it) }
    }
}

/** "Informações": o projeto, o início, com o tempo decorrido, e a conclusão, ou "ainda não concluído". */
@Composable
private fun InfoSection(
    task: TaskDetail,
    now: Instant,
) {
    Section("Informações") {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            // Só leitura: o projeto de uma tarefa de agente não muda depois que ela nasce.
            FactRow("Projeto") { ProjectLine(task.card.project) }
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
                if (entity.kind == EntityKind.Task) BraidIcons.calendarDays else DocumentIcons.producedGlyph(entity.artifactType),
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
        HermesStatusLine(
            requestBotState(content, voice.listening),
            if (voice.listening) EDIT_LISTENING_TEXT else content.statusLine,
            plain = true,
        ) {
            if (content.canCancel) {
                Box(
                    Modifier
                        .heightIn(min = 44.dp)
                        .alpha(if (composer.cancelling) DISABLED_ALPHA else 1f)
                        .clickable(enabled = !composer.cancelling, role = Role.Button, onClick = onCancel)
                        .padding(horizontal = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Cancelar pedido", color = scheme.error, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        val enabled = tracked != null && !composer.sending
        HermesComposer(
            draft =
                HermesDraft(
                    text = composer.draft,
                    onChange = onDraftChange,
                    placeholder = "Responda ou peça uma mudança",
                    label = "Pedir à IA para editar este pedido",
                    enabled = enabled,
                ),
            send =
                HermesSend(
                    enabled = content.canSend && composer.draft.isNotBlank(),
                    label = if (composer.sending) "Aguardando a resposta" else "Enviar pedido",
                    onSend = onSend,
                ),
            context = tracked?.let { { HermesContextCard(BraidIcons.messageSquare, "Pedido · ${momentLabel(it.createdAt)}", it.title) } },
            actions = {
                if (voice.available) VoiceButton(listening = voice.listening, enabled = enabled, onClick = onToggleVoice)
            },
        )
    }
}

/** O robô da linha de status, como no web: ouvindo, pensando enquanto o pedido anda, o ✓ ou a exclamação no fim. */
private fun requestBotState(
    content: AgentTaskUiState.Content,
    listening: Boolean,
): BotState {
    val tracked = content.tracked
    return when {
        listening -> BotState.Listening
        tracked == null || content.composer.sending || isOpenAgentStatus(tracked.status) -> BotState.Thinking
        isSuccessAgentStatus(tracked.status) -> BotState.Done
        tracked.status == TaskStatus.Failed -> BotState.Error
        else -> BotState.Idle
    }
}

private const val DISABLED_ALPHA = 0.55f

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
