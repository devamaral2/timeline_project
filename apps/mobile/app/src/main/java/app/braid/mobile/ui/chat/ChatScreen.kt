package app.braid.mobile.ui.chat

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.chat.ChatCommand
import app.braid.mobile.domain.chat.end
import app.braid.mobile.domain.chat.parseCommand
import app.braid.mobile.domain.chat.start
import app.braid.mobile.domain.request.PROMPT_MAX_LENGTH
import app.braid.mobile.domain.request.appendTranscript
import app.braid.mobile.domain.request.isModelCommand
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.timeline.briefDate
import app.braid.mobile.ui.agenda.freeDurationLabel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/** Quanto a barra inferior (dock de 66dp com o respiro de baixo) ocupa: o chat termina logo acima dela. */
private val DockReserve = 90.dp

/** O respiro entre o campo e o teclado aberto (o mesmo do web, `shell.module.css`): o campo não encosta nas teclas. */
private val KeyboardGap = 12.dp

/**
 * O chat com o agente, que no celular ocupa a tela toda acima da barra inferior (como o web na largura mobile). Estado e
 * ações vêm do [ChatViewModel], que vive acima dele; [commands] liga os comandos "/" e os atalhos da tela inicial, e
 * [composerActions] é o lugar ao lado do campo para a voz (ticket 19).
 */
@Composable
fun ChatOverlay(
    chat: ChatViewModel,
    commands: ChatCommandHandlers,
    links: ChatEntityLinks,
    modifier: Modifier = Modifier,
    composerActions: @Composable RowScope.() -> Unit = {},
) {
    val state by chat.state.collectAsStateWithLifecycle()
    // O sistema pergunta pelo microfone na primeira vez; a resposta volta ao chat, que liga a escuta ou explica.
    val askMicrophone =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> chat.microphoneResult(granted) }
    LaunchedEffect(state.voice.askPermission) {
        if (state.voice.askPermission) askMicrophone.launch(Manifest.permission.RECORD_AUDIO)
    }
    // Com o app fora de vista o microfone não fica aberto.
    LifecycleStartEffect(Unit) { onStopOrDispose { chat.pauseVoice() } }
    ChatScreen(
        state = state,
        commands = commands,
        links = links,
        onSend = chat::submit,
        onChoose = { chat.send(it) },
        onRetry = chat::retry,
        onCancel = chat::cancel,
        onNewConversation = chat::startNewConversation,
        onPane = chat::setPane,
        onClearWindow = chat::clearFreeWindow,
        onClose = chat::close,
        modifier = modifier,
        promptEdits = chat.promptEdits,
        onTyped = chat::typed,
        onDraft = chat::syncDraft,
        model = ModelActions({ provider, model -> chat.chooseModel(model, provider) }, chat::chooseEffort, chat::toggleFavorite),
        composerActions = {
            if (state.voice.available) {
                VoiceButton(
                    listening = state.voice.listening,
                    enabled = state.ready && state.pending == null,
                    onClick = chat::toggleVoice,
                    square = true,
                )
            }
            composerActions()
        },
    )
}

@Composable
fun ChatScreen(
    state: ChatUiState,
    commands: ChatCommandHandlers,
    links: ChatEntityLinks,
    onSend: (String) -> Boolean,
    onChoose: (String) -> Unit,
    onRetry: (String) -> Unit,
    onCancel: () -> Unit,
    onNewConversation: () -> Unit,
    onPane: (ChatPane) -> Unit,
    onClearWindow: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    /** O texto novo do campo vindo da voz (a transcrição, ou o campo limpo quando o que foi dito já foi enviado). */
    promptEdits: Flow<String> = emptyFlow(),
    /** A pessoa digitou: a primeira tecla desliga o microfone. */
    onTyped: (String) -> Unit = {},
    /** O que está escrito no campo, para a fala ser somada a isso. */
    onDraft: (String) -> Unit = {},
    /** As trocas do seletor de modelo. */
    model: ModelActions = ModelActions(),
    composerActions: @Composable RowScope.() -> Unit = {},
) {
    val scheme = MaterialTheme.colorScheme
    var prompt by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(promptEdits) { promptEdits.collect { prompt = it.take(PROMPT_MAX_LENGTH) } }
    LaunchedEffect(prompt) { onDraft(prompt) }
    // Enquanto o microfone está aberto o campo mostra o que já foi ouvido, depois do que estava escrito.
    val listening = state.voice.listening
    val shown = if (listening && state.voice.heard.isNotEmpty()) appendTranscript(prompt, state.voice.heard) else prompt
    val query = if (listening) null else parseCommand(prompt, commands.available)
    val matches = query?.matches.orEmpty()
    val density = LocalDensity.current
    // Com o teclado aberto a barra inferior fica atrás dele e o campo sobe até logo acima das teclas.
    val keyboard = WindowInsets.ime.getBottom(density)
    val aboveKeyboard = if (keyboard > 0) keyboard + with(density) { KeyboardGap.toPx() } else 0f
    val reserved = with(density) { DockReserve.toPx() } + WindowInsets.navigationBars.getBottom(density)
    val bottom = with(density) { maxOf(aboveKeyboard, reserved).toDp() }

    // O seletor de modelo: aberta, a folha sobe por cima da tela inteira. Some no modo Hermes ou sem as opções.
    val picker = state.picker
    var pickerOpen by rememberSaveable { mutableStateOf(false) }
    val showPicker = picker != null
    LaunchedEffect(showPicker) { if (!showPicker) pickerOpen = false }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    fun submit() {
        val first = matches.firstOrNull()
        if (first != null) {
            commands.run(first, query?.argument.orEmpty())
            prompt = ""
            return
        }
        // `/model` abre a folha da escolha do modelo, que o campo não mostra; não vira mensagem.
        if (showPicker && isModelCommand(shown)) {
            prompt = ""
            pickerOpen = true
            focusManager.clearFocus()
            keyboardController?.hide()
            return
        }
        if (shown.isNotBlank() && onSend(shown)) prompt = ""
    }

    Box(
        modifier
            .fillMaxSize()
            .background(scheme.background)
            .pointerInput(Unit) { detectTapGestures { } },
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(start = 16.dp, end = 16.dp, bottom = bottom),
        ) {
            ChatHeader(state, onNewConversation)
            if (state.isConversation) ChatPanes(state, onPane)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    matches.isNotEmpty() ->
                        CommandList(matches) {
                            commands.run(it, query?.argument.orEmpty())
                            prompt = ""
                        }
                    !state.isConversation ->
                        ChatHome(state, commands) {
                            commands.run(it, "")
                            prompt = ""
                        }
                    state.pane == ChatPane.Process -> AgentTraceView(state.turns, Modifier.padding(top = 20.dp))
                    else -> Conversation(state, links, onChoose, onRetry, onClose, onOpenProcess = { onPane(ChatPane.Process) })
                }
            }
            ChatField(
                state = state,
                prompt = shown,
                onPrompt = {
                    onTyped(it.take(PROMPT_MAX_LENGTH))
                    prompt = it.take(PROMPT_MAX_LENGTH)
                },
                canSend = state.ready && state.pending == null && (shown.isNotBlank() || matches.isNotEmpty()),
                onSubmit = ::submit,
                onCancel = onCancel,
                onClearWindow = onClearWindow,
                composerActions = composerActions,
            )
        }
        if (picker != null) ModelSheet(picker, pickerOpen, model, onClose = { pickerOpen = false })
    }
}

@Composable
private fun ChatHeader(
    state: ChatUiState,
    onNewConversation: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val enabled = state.isConversation && state.pending == null
    Column {
        Row(Modifier.fillMaxWidth().heightIn(min = 60.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(44.dp)
                    .alpha(if (enabled) 1f else 0.4f)
                    .clickable(enabled = enabled, role = Role.Button, onClick = onNewConversation)
                    .semantics { contentDescription = "Nova conversa" },
                contentAlignment = Alignment.Center,
            ) {
                SvgIcon(BraidIcons.plus, size = 20.dp, color = scheme.onSurfaceVariant, strokeWidth = 2f)
            }
            Column(Modifier.weight(1f).padding(start = 4.dp)) {
                Text(
                    text = (state.agentMode?.title ?: "Assistente").uppercase(),
                    color = scheme.onSurfaceVariant,
                    fontFamily = BraidMonoFont,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    letterSpacing = 0.1.em,
                )
                Text(
                    text = if (state.isConversation) "Conversa" else "Nova conversa",
                    color = scheme.onBackground,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
    }
}

/** "Conversa" e "Processo": as duas vistas do chat, com a contagem dos passos do último pedido. */
@Composable
private fun ChatPanes(
    state: ChatUiState,
    onPane: (ChatPane) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val steps =
        state.turns
            .lastOrNull()
            ?.trace
            ?.entries
            ?.size ?: 0
    Column(Modifier.semantics { contentDescription = "Vista do chat" }) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            for ((pane, label) in listOf(ChatPane.Conversation to "Conversa", ChatPane.Process to "Processo")) {
                val active = state.pane == pane
                Row(
                    Modifier
                        .heightIn(min = 44.dp)
                        .clickable(role = Role.Tab) { onPane(pane) }
                        .semantics { selected = active },
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = label.uppercase(),
                        color = if (active) scheme.onBackground else scheme.onSurfaceVariant,
                        fontFamily = BraidMonoFont,
                        fontSize = 12.sp,
                        letterSpacing = 0.1.em,
                    )
                    if (pane == ChatPane.Process && steps > 0) {
                        Text(
                            text = steps.toString(),
                            modifier =
                                Modifier
                                    .background(
                                        if (state.pending !=
                                            null
                                        ) {
                                            scheme.tertiary.copy(alpha = 0.16f)
                                        } else {
                                            scheme.secondary
                                        },
                                        CircleShape,
                                    ).padding(horizontal = 6.dp),
                            color = if (state.pending != null) scheme.tertiary else scheme.onSurfaceVariant,
                            fontSize = 11.sp,
                            lineHeight = 18.sp,
                        )
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
        // O traço sob a vista atual.
    }
}

@Composable
private fun ChatHome(
    state: ChatUiState,
    commands: ChatCommandHandlers,
    onCommand: (ChatCommand) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val window = state.freeWindow
    Column(
        Modifier.fillMaxSize().padding(start = 4.dp, end = 4.dp, top = 24.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.Bottom,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = if (window != null) "O que vamos fazer das ${window.start} às ${window.end}?" else "O que vamos fazer?",
                    color = scheme.onBackground,
                    fontFamily = BraidDisplayFont,
                    fontSize = 38.sp,
                    lineHeight = 42.sp,
                    letterSpacing = (-0.015).em,
                )
                if (state.signedOut) {
                    Text(text = "Entre na sua conta para conversar com a IA.", color = scheme.onSurfaceVariant, fontSize = 13.sp)
                }
            }
            // Com uma janela anexada a pergunta já é o convite: os atalhos de criar saem.
            if (commands.available.isNotEmpty() && window == null) {
                Column(Modifier.fillMaxWidth().semantics { contentDescription = "Criar, pesquisar e ajustar" }) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
                    for (command in commands.available) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 52.dp)
                                .clickable(role = Role.Button) { onCommand(command) },
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            SvgIcon(commandIcon(command), size = 20.dp, color = scheme.onSurfaceVariant, strokeWidth = 1.75f)
                            Text(text = command.label, color = scheme.onBackground, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                        }
                        Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
                    }
                }
            }
        }
    }
}

private fun commandIcon(command: ChatCommand): List<SvgPart> =
    when (command) {
        ChatCommand.Task -> BraidIcons.calendarDays
        ChatCommand.Document -> BraidIcons.fileText
        ChatCommand.Search -> BraidIcons.search
        ChatCommand.Notifications -> ChatIcons.bell
        ChatCommand.Settings -> ChatIcons.settings
    }

/** Os comandos que ainda casam com o que foi digitado depois da barra. */
@Composable
private fun CommandList(
    matches: List<ChatCommand>,
    onRun: (ChatCommand) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxSize().semantics { contentDescription = "Comandos" }, verticalArrangement = Arrangement.Bottom) {
        for ((index, command) in matches.withIndex()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .background(
                        if (index ==
                            0
                        ) {
                            scheme.secondaryContainer
                        } else {
                            androidx.compose.ui.graphics.Color.Transparent
                        },
                        RoundedCornerShape(5.dp),
                    ).clickable(role = Role.Button) { onRun(command) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SvgIcon(commandIcon(command), size = 20.dp, color = scheme.onSurfaceVariant, strokeWidth = 1.75f)
                Column(Modifier.weight(1f)) {
                    Text(text = command.label, color = scheme.onBackground, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text(text = command.hint, color = scheme.onSurfaceVariant, fontSize = 13.sp)
                }
                Text(text = "/${command.slug}", color = scheme.onSurfaceVariant, fontFamily = BraidMonoFont, fontSize = 12.sp)
            }
        }
    }
}

/**
 * A conversa (canvas "Chat com o Hermes — conversa limpa", opção B): o pedido num balão à direita e a fala do assistente em
 * texto solto, sob o robô cinza e o nome. Enquanto um pedido roda ela não ganha nada: o passo atual vai na linha de status
 * do campo, e a caixa de processo e os passos do Hermes ficam na aba "Processo".
 */
@Composable
private fun Conversation(
    state: ChatUiState,
    links: ChatEntityLinks,
    onChoose: (String) -> Unit,
    onRetry: (String) -> Unit,
    onClose: () -> Unit,
    onOpenProcess: () -> Unit,
) {
    val listState = rememberLazyListState()
    val last = state.messages.lastOrNull()
    val lastId = last?.id
    val free = state.pending == null
    val shown = remember(state.messages) { state.messages.filter { it.inConversation() } }
    // O nome sobre cada fala é o de quem responde agora, o mesmo do topo do chat.
    val name = state.agentMode?.title ?: "Assistente"
    // A última fala do assistente, quando é ela que fecha a conversa: é dela que se copia o texto.
    val lastAnswer =
        when (last) {
            is ChatMessage.Assistant -> last.text
            is ChatMessage.Process ->
                last.request
                    ?.takeIf { it.status == TaskStatus.Done }
                    ?.message
                    .orEmpty()
            else -> ""
        }
    val actions = free && lastAnswer.isNotBlank()
    val steps =
        state.turns
            .lastOrNull()
            ?.trace
            ?.entries
            ?.size ?: 0
    val count = shown.size + if (actions) 1 else 0
    // Rola até o fim a cada mensagem nova e quando as ações da última resposta entram.
    LaunchedEffect(lastId, count) {
        if (count > 0) listState.animateScrollToItem(count - 1)
    }
    LazyColumn(
        modifier =
            Modifier.fillMaxSize().semantics {
                contentDescription = "Conversa com a IA"
                liveRegion = LiveRegionMode.Polite
            },
        state = listState,
        contentPadding =
            androidx.compose.foundation.layout
                .PaddingValues(top = 20.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        itemsIndexed(shown, key = { _, message -> message.id }) { _, message ->
            when (message) {
                is ChatMessage.User -> UserBubble(message)
                is ChatMessage.Assistant ->
                    Column {
                        ChatReply(name) {
                            // Os botões de escolha só valem na última mensagem, com o chat livre.
                            ChatAnswer(message.text, onChoose = if (message.id == lastId && state.ready && free) onChoose else null)
                        }
                        EntityRows(message.entities, links, onClose)
                        message.model?.let { ModelFooter(state.model.options, it) }
                    }
                is ChatMessage.Process -> message.request?.let { ProcessAnswer(it, name, links, onClose) }
                is ChatMessage.HermesSteps -> Unit
                is ChatMessage.Error -> ErrorBubble(message, onRetry = if (free) ({ onRetry(message.id) }) else null)
            }
        }
        // As ações encostam na resposta: sobem por cima do respiro entre os itens da lista.
        if (actions) item(key = "actions") { ChatActions(lastAnswer, steps, onOpenProcess, Modifier.offset(y = (-14).dp)) }
    }
}

@Composable
private fun ChatField(
    state: ChatUiState,
    prompt: String,
    onPrompt: (String) -> Unit,
    canSend: Boolean,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
    onClearWindow: () -> Unit,
    composerActions: @Composable RowScope.() -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val window = state.freeWindow
    val lastIsError = state.messages.lastOrNull() is ChatMessage.Error
    val listening = state.voice.listening
    val mark =
        if (listening) {
            BotState.Listening
        } else if (state.pending != null) {
            BotState.Thinking
        } else if (lastIsError) {
            BotState.Error
        } else {
            BotState.Idle
        }
    val status =
        when {
            listening -> "Ouvindo…"
            // Enquanto o pedido roda, a linha diz o passo em que o agente está (a conversa não mostra o andamento).
            state.pending != null -> "${pendingStepLabel(state.messages, state.pending)}…"
            lastIsError -> "Não deu certo"
            else -> "Esperando o seu pedido"
        }
    // Abrir o chat foca o campo, para já dar para digitar (o campo só aceita foco depois de a sessão chegar).
    val focus = remember { FocusRequester() }
    LaunchedEffect(state.ready) {
        if (state.ready) runCatching { focus.requestFocus() }
    }
    Column(
        Modifier.fillMaxWidth().padding(top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val notice = state.voice.notice
        if (notice != null) {
            Text(
                text = notice,
                modifier = Modifier.padding(start = 6.dp).semantics { liveRegion = LiveRegionMode.Polite },
                color = scheme.onSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
        HermesStatusLine(mark, status, role = MarkRole.Chat, plain = true)
        HermesComposer(
            draft =
                HermesDraft(
                    text = prompt,
                    onChange = onPrompt,
                    placeholder = if (window != null) "Diga o que quer fazer nesse tempo" else "Diga ou escreva o que precisa",
                    label = "Mensagem para a IA",
                    enabled = state.ready,
                    sendOnEnter = true,
                    modifier = Modifier.focusRequester(focus),
                ),
            send =
                if (state.pending?.requestId != null) {
                    // Com o pedido aceito pela API, a seta vira o quadrado que o cancela: a conversa não tem mais a caixa de processo.
                    HermesSend(enabled = true, label = "Cancelar pedido", onSend = onCancel, stop = true)
                } else {
                    HermesSend(
                        enabled = canSend,
                        label = if (state.pending != null) "Aguardando a resposta" else "Enviar mensagem",
                        onSend = onSubmit,
                    )
                },
            role = MarkRole.Chat,
            context = if (window != null) ({ WindowChip(window, state.todayKey, onClearWindow) }) else null,
            actions = composerActions,
            // A pílula não mostra o modelo: a folha da escolha sobe quando se envia `/model`.
            layout = HermesFieldLayout.Pill,
        )
    }
}

/** A janela livre que abriu o chat, anexada ao campo até ser enviada ou tirada. */
@Composable
private fun WindowChip(
    window: FreeWindow,
    todayKey: String,
    onClear: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = braidBrand()
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .drawBehind {
                drawRoundRect(
                    color = brand,
                    cornerRadius = CornerRadius(22.dp.toPx()),
                    style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))),
                )
            }.padding(start = 6.dp, end = 2.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp),
            contentAlignment = Alignment.Center,
        ) { SvgIcon(BraidIcons.plus, size = 20.dp, color = brand, strokeWidth = 1.75f) }
        Column(Modifier.weight(1f)) {
            Text(
                text = "Janela livre · ${if (window.dayKey == todayKey) "hoje" else briefDate(window.dayKey)}",
                color = scheme.onSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
            Text(
                text = "${window.start} — ${window.end}",
                color = scheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Text(
            text = freeDurationLabel(window.minutes),
            modifier = Modifier.padding(end = 4.dp),
            color = brand,
            fontFamily = BraidDisplayFont,
            fontSize = 22.sp,
            lineHeight = 22.sp,
        )
        Box(
            Modifier
                .size(44.dp)
                .clickable(role = Role.Button, onClick = onClear)
                .semantics { contentDescription = "Tirar a janela livre do pedido" },
            contentAlignment = Alignment.Center,
        ) { SvgIcon(BraidIcons.close, size = 20.dp, color = scheme.onSurfaceVariant, strokeWidth = 2f) }
    }
}
