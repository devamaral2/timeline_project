package app.braid.mobile.ui.assistant

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.documentTokens
import app.braid.mobile.domain.assistant.recordWhenLabel
import app.braid.mobile.domain.chat.chatEntityText
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.QueryTable
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.ui.chat.BotState
import app.braid.mobile.ui.chat.ChatIcons
import app.braid.mobile.ui.chat.ChatMessage
import app.braid.mobile.ui.chat.ChatUiState
import app.braid.mobile.ui.chat.ChatViewModel
import app.braid.mobile.ui.chat.ErrorBubble
import app.braid.mobile.ui.chat.HermesBot
import app.braid.mobile.ui.chat.HermesComposer
import app.braid.mobile.ui.chat.HermesDraft
import app.braid.mobile.ui.chat.HermesFieldLayout
import app.braid.mobile.ui.chat.HermesSend
import app.braid.mobile.ui.chat.MarkRole
import app.braid.mobile.ui.chat.QueryRows
import app.braid.mobile.ui.chat.VoiceButton
import app.braid.mobile.ui.chat.pendingStepLabel
import app.braid.mobile.ui.chat.processAnswerShows
import app.braid.mobile.ui.chat.processText

private val PanelShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
private val CardShape = RoundedCornerShape(22.dp)
private const val SCRIM_ALPHA = 0.32f

/** O que a resposta ao último pedido deixa no painel: o texto, as linhas de uma consulta, os registros gravados ou o erro. */
internal class PanelAnswer(
    val text: String? = null,
    val query: QueryTable? = null,
    val entities: List<RequestEntity> = emptyList(),
    val error: ChatMessage.Error? = null,
)

/**
 * A resposta ao último pedido da conversa, venha ela como fala do assistente ou como pedido por passos (o que cria e altera
 * registros). O pedido por passos só conta quando termina e tem algo para ler, como no chat do app.
 */
internal fun panelAnswer(messages: List<ChatMessage>): PanelAnswer? {
    val asked = messages.indexOfLast { it is ChatMessage.User }
    for (index in messages.lastIndex downTo asked + 1) {
        when (val message = messages[index]) {
            is ChatMessage.Assistant -> return PanelAnswer(text = message.text, entities = message.entities)
            is ChatMessage.Error -> return PanelAnswer(error = message)
            is ChatMessage.Process -> {
                val request = message.request?.takeIf { processAnswerShows(it) } ?: continue
                return PanelAnswer(processText(request), request.steps.firstOrNull { it.result != null }?.result, request.entities)
            }
            else -> Unit
        }
    }
    return null
}

/**
 * O painel do assistente do celular (canvas "Painel do assistente — opções", modelo B): uma folha na base da tela, sobre uma
 * sombra, com as peças do chat do app. No topo, o robô e o estado do pedido; depois o que a pessoa disse, a resposta e um
 * cartão por registro criado ou alterado; embaixo, o campo em pílula do chat. Quem manda é o [chat]: ele ouve quando o painel
 * abre e envia no silêncio. Depois da resposta o microfone fica desligado: quem quer falar de novo toca na onda.
 */
@Composable
fun AssistantPanel(
    chat: ChatViewModel,
    records: AssistantRecordsViewModel,
    onClose: () -> Unit,
    onOpenApp: () -> Unit,
    onOpenTask: (String) -> Unit,
) {
    val state by chat.state.collectAsState()
    val cards by records.cards.collectAsState()
    var text by remember { mutableStateOf("") }
    // O microfone que a pessoa negou: sem uma Activity aqui não há como pedir, então o painel manda para o app.
    var micDenied by remember { mutableStateOf(false) }

    LaunchedEffect(chat) {
        // A voz escreve no campo (a transcrição, ou o campo limpo quando o que foi dito é enviado).
        chat.promptEdits.collect {
            text = it
            chat.syncDraft(it)
        }
    }
    LaunchedEffect(state.voice.askPermission) {
        if (state.voice.askPermission) {
            micDenied = true
            chat.microphoneResult(granted = false)
        }
    }

    val entities = remember(state.messages) { panelAnswer(state.messages)?.entities.orEmpty() }
    LaunchedEffect(entities) { records.show(entities) }

    AssistantPanelContent(
        state = state,
        cards = cards,
        text = text,
        micDenied = micDenied,
        actions =
            AssistantPanelActions(
                onText = {
                    text = it
                    chat.typed(it)
                },
                onSubmit = { if (chat.submit(text)) text = "" },
                onCancel = chat::cancel,
                onVoice = {
                    micDenied = false
                    chat.toggleVoice()
                },
                onRetry = chat::retry,
                onClose = onClose,
                onOpenApp = onOpenApp,
                onOpenTask = onOpenTask,
            ),
    )
}

/** O que o painel pede a quem o hospeda: o texto do campo, o pedido, a voz e para onde ir. */
internal class AssistantPanelActions(
    val onText: (String) -> Unit,
    val onSubmit: () -> Unit,
    val onCancel: () -> Unit,
    val onVoice: () -> Unit,
    val onRetry: (String) -> Unit,
    val onClose: () -> Unit,
    val onOpenApp: () -> Unit,
    val onOpenTask: (String) -> Unit,
)

/** O desenho do painel, só com o estado: a sombra, a folha, o topo, o miolo e o campo. */
@Composable
internal fun AssistantPanelContent(
    state: ChatUiState,
    cards: Map<String, TaskCard>,
    text: String,
    micDenied: Boolean,
    actions: AssistantPanelActions,
) {
    val scheme = MaterialTheme.colorScheme
    val answer = remember(state.messages) { panelAnswer(state.messages) }
    val pending = state.pending
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = SCRIM_ALPHA))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = actions.onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(PanelShape)
                .background(scheme.background)
                // Toques no painel não fecham: só o que está fora dele.
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = {})
                .windowInsetsPadding(WindowInsets.navigationBars)
                .windowInsetsPadding(WindowInsets.ime)
                .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp),
        ) {
            PanelTop(state, answer, actions.onOpenApp, actions.onClose)
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(max = 400.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 2.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                PanelBody(
                    state = state,
                    answer = answer,
                    cards = cards,
                    micDenied = micDenied,
                    onRetry = actions.onRetry,
                    onOpenTask = actions.onOpenTask,
                )
            }
            HermesComposer(
                draft =
                    HermesDraft(
                        text = text,
                        onChange = actions.onText,
                        placeholder = if (answer != null) "Peça outra coisa" else "Diga ou escreva o que precisa",
                        label = "Mensagem para a IA",
                        enabled = state.ready,
                        sendOnEnter = true,
                    ),
                send =
                    if (pending?.requestId != null) {
                        // Com o pedido aceito pela API, a seta vira o quadrado que o cancela, como no chat.
                        HermesSend(enabled = true, label = "Cancelar pedido", onSend = actions.onCancel, stop = true)
                    } else {
                        HermesSend(
                            enabled = text.isNotBlank() && state.ready && pending == null,
                            label = if (pending != null) "Aguardando a resposta" else "Enviar mensagem",
                            onSend = actions.onSubmit,
                        )
                    },
                modifier = Modifier.padding(top = 16.dp),
                role = MarkRole.Chat,
                actions = {
                    if (state.voice.available) {
                        VoiceButton(
                            listening = state.voice.listening,
                            enabled = state.ready && pending == null,
                            onClick = actions.onVoice,
                            square = true,
                        )
                    }
                },
                layout = HermesFieldLayout.Pill,
            )
        }
    }
}

/** O topo do painel: o robô no estado do pedido, o que ele faz agora (ou quem responde) e os botões de abrir o app e fechar. */
@Composable
private fun PanelTop(
    state: ChatUiState,
    answer: PanelAnswer?,
    onOpenApp: () -> Unit,
    onClose: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val pending = state.pending
    val listening = state.voice.listening
    val failed = answer?.error != null && pending == null && !listening
    val mark =
        when {
            listening -> BotState.Listening
            pending != null -> BotState.Thinking
            failed -> BotState.Error
            else -> BotState.Idle
        }
    val status =
        when {
            listening -> "Ouvindo…"
            pending != null -> "${pendingStepLabel(state.messages, pending)}…"
            failed -> "Não deu certo"
            // O nome de quem responde agora, o mesmo do topo do chat.
            else -> state.agentMode?.title ?: "Assistente"
        }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(start = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HermesBot(mark, 20.dp, Modifier.clearAndSetSemantics {}, plain = true)
        Text(
            text = status,
            modifier = Modifier.weight(1f).padding(start = 10.dp).semantics { liveRegion = LiveRegionMode.Polite },
            color = if (failed) scheme.error else scheme.onSurfaceVariant,
            fontSize = 13.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        // Os ícones encostam na margem do painel: o toque de 44 dp passa 8 dp dela.
        Row(Modifier.offset(x = 8.dp)) {
            TopButton(ChatIcons.arrowUpRight, "Abrir o app", onOpenApp)
            TopButton(BraidIcons.close, "Fechar o assistente", onClose)
        }
    }
}

@Composable
private fun TopButton(
    icon: List<SvgPart>,
    label: String,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        SvgIcon(
            icon,
            size = 20.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            strokeWidth = 1.65f,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}

/** O miolo: o que o microfone ouve, em letra grande; depois o pedido numa linha discreta, a resposta e os cartões. */
@Composable
private fun PanelBody(
    state: ChatUiState,
    answer: PanelAnswer?,
    cards: Map<String, TaskCard>,
    micDenied: Boolean,
    onRetry: (String) -> Unit,
    onOpenTask: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val user = state.messages.lastOrNull { it is ChatMessage.User } as? ChatMessage.User
    val listening = state.voice.listening
    when {
        state.signedOut -> Hint("Entre na sua conta no app para usar o assistente.")
        !state.ready && state.messages.isEmpty() && !listening -> Hint("Conectando…")
        listening -> Heard(state.voice.heard)
        else -> {
            if (user != null) Text(user.text, color = scheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 21.sp)
            if (answer != null) Answer(answer, cards, free = state.pending == null, onRetry = onRetry, onOpenTask = onOpenTask)
            if (user == null && answer == null) {
                Hint(
                    when {
                        micDenied -> "Permita o microfone nas configurações do app."
                        state.voice.available -> "Toque na onda para falar ou escreva o pedido."
                        else -> "Escreva o pedido."
                    },
                )
            }
        }
    }
    state.voice.notice?.let { Hint(it) }
}

@Composable
private fun Answer(
    answer: PanelAnswer,
    cards: Map<String, TaskCard>,
    free: Boolean,
    onRetry: (String) -> Unit,
    onOpenTask: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        answer.error?.let { error -> ErrorBubble(error, onRetry = if (free) ({ onRetry(error.id) }) else null) }
        answer.text?.takeIf { it.isNotBlank() }?.let { AssistantAnswer(it) }
        answer.query?.let { QueryRows(it) }
        for (entity in answer.entities) {
            // Só a tarefa que ainda existe tem para onde ir: o app abre o detalhe dela pelo id.
            val opens = entity.kind == EntityKind.Task && entity.operation != RequestOperation.Delete
            RecordCard(entity, cards[entity.id], onOpen = if (opens) ({ onOpenTask(entity.id) }) else null)
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text = text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, lineHeight = 22.sp)
}

/** O que o microfone já ouviu, no tamanho de uma fala. */
@Composable
private fun Heard(heard: String) {
    Text(
        text = heard.ifBlank { "Pode falar…" },
        modifier = Modifier.padding(top = 6.dp, bottom = 10.dp),
        color = if (heard.isBlank()) braidTokens().faint else MaterialTheme.colorScheme.onBackground,
        fontSize = 22.sp,
        lineHeight = 30.sp,
        fontWeight = FontWeight.Medium,
    )
}

/**
 * O registro que o pedido criou, alterou ou apagou, num cartão: o ponto na cor do tipo e o que aconteceu ("Tarefa criada"),
 * o nome e, na tarefa já lida ([card]), quando ela acontece. Com [onOpen], o cartão inteiro abre o registro no app.
 */
@Composable
private fun RecordCard(
    entity: RequestEntity,
    card: TaskCard?,
    onOpen: (() -> Unit)?,
) {
    val scheme = MaterialTheme.colorScheme
    val deleted = entity.operation == RequestOperation.Delete
    val whenLabel = card?.takeIf { !deleted }?.let(::recordWhenLabel)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(scheme.surface)
            .border(1.dp, scheme.outline, CardShape)
            .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
            .semantics(mergeDescendants = true) {},
    ) {
        Column(Modifier.padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 14.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(recordColor(entity, card), CircleShape))
                Text(
                    text = chatEntityText(entity).uppercase(),
                    color = scheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontWeight = FontWeight.Medium,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    letterSpacing = 0.1.em,
                )
            }
            Text(
                text = entity.name,
                modifier = Modifier.padding(top = 8.dp),
                color = if (deleted) scheme.onSurfaceVariant else scheme.onBackground,
                fontSize = 20.sp,
                lineHeight = 26.sp,
                fontWeight = FontWeight.SemiBold,
                textDecoration = if (deleted) TextDecoration.LineThrough else null,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (whenLabel != null) {
                Text(
                    text = whenLabel,
                    modifier = Modifier.padding(top = 4.dp),
                    color = scheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                )
            }
        }
        if (onOpen != null) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(start = 18.dp, end = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Abrir no app", color = scheme.onBackground, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold)
                SvgIcon(
                    BraidIcons.chevronRight,
                    size = 16.dp,
                    color = braidTokens().faint,
                    strokeWidth = 2f,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
        }
    }
}

/**
 * A cor do ponto do cartão: a do tipo da tarefa (refeição, sono, treino), o azul de rotina para as demais, e o cinza para o
 * documento e para o registro apagado.
 */
@Composable
private fun recordColor(
    entity: RequestEntity,
    card: TaskCard?,
): Color {
    if (entity.kind != EntityKind.Task || entity.operation == RequestOperation.Delete) return MaterialTheme.colorScheme.outlineVariant
    return when (card?.kind) {
        TaskKind.Meal -> documentTokens().meal
        TaskKind.Sleep -> documentTokens().sleep
        TaskKind.Training -> documentTokens().training
        else -> braidTokens().routine
    }
}
