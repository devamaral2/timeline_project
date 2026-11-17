package app.braid.mobile.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.chat.ChatCommand
import app.braid.mobile.domain.chat.end
import app.braid.mobile.domain.chat.parseCommand
import app.braid.mobile.domain.chat.start
import app.braid.mobile.domain.timeline.briefDate

/** Quanto a barra inferior (dock de 66dp com o respiro de baixo) ocupa: o chat termina logo acima dela. */
private val DockReserve = 98.dp
private const val MAX_PROMPT = 4000

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
        composerActions = composerActions,
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
    composerActions: @Composable RowScope.() -> Unit = {},
) {
    val scheme = MaterialTheme.colorScheme
    var prompt by rememberSaveable { mutableStateOf("") }
    val query = parseCommand(prompt, commands.available)
    val matches = query?.matches.orEmpty()
    val density = LocalDensity.current
    val keyboard = WindowInsets.ime.getBottom(density)
    val reserved = with(density) { DockReserve.toPx() } + WindowInsets.navigationBars.getBottom(density)
    val bottom = with(density) { maxOf(keyboard.toFloat(), reserved).toDp() }

    fun submit() {
        val first = matches.firstOrNull()
        if (first != null) {
            commands.run(first, query?.argument.orEmpty())
            prompt = ""
            return
        }
        if (prompt.isNotBlank() && onSend(prompt)) prompt = ""
    }

    Column(
        modifier
            .fillMaxSize()
            .background(scheme.background)
            .pointerInput(Unit) { detectTapGestures { } }
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
                else -> Conversation(state, links, onChoose, onRetry, onCancel, onClose)
            }
        }
        ChatField(
            state = state,
            prompt = prompt,
            onPrompt = { prompt = it.take(MAX_PROMPT) },
            canSend = state.ready && state.pending == null && (prompt.isNotBlank() || matches.isNotEmpty()),
            onSubmit = ::submit,
            onClearWindow = onClearWindow,
            composerActions = composerActions,
        )
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
                SvgIcon(ChatIcons.plus, size = 20.dp, color = scheme.onSurfaceVariant, strokeWidth = 2f)
            }
            Column(Modifier.weight(1f).padding(start = 4.dp)) {
                Text(
                    text = (if (state.hermesMode) "Hermes" else "Assistente").uppercase(),
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
        ChatCommand.Task -> ChatIcons.calendarDays
        ChatCommand.Document -> ChatIcons.fileText
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

@Composable
private fun Conversation(
    state: ChatUiState,
    links: ChatEntityLinks,
    onChoose: (String) -> Unit,
    onRetry: (String) -> Unit,
    onCancel: () -> Unit,
    onClose: () -> Unit,
) {
    val listState = rememberLazyListState()
    val lastId = state.messages.lastOrNull()?.id
    val label = state.pending?.label
    // Rola até o fim a cada mensagem nova ou passo de progresso.
    LaunchedEffect(lastId, label) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
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
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        itemsIndexed(state.messages, key = { _, message -> message.id }) { _, message ->
            when (message) {
                is ChatMessage.User -> UserBubble(message)
                is ChatMessage.Assistant ->
                    Column {
                        // Os botões de escolha só valem na última mensagem, com o chat livre.
                        ChatAnswer(
                            message.text,
                            onChoose =
                                if (message.id == lastId &&
                                    state.ready &&
                                    state.pending == null
                                ) {
                                    onChoose
                                } else {
                                    null
                                },
                        )
                        EntityRows(message.entities, links, onClose)
                    }
                is ChatMessage.Process ->
                    ProcessBox(
                        message.request,
                        links,
                        onClose,
                        onCancel =
                            if (state.pending !=
                                null
                            ) {
                                onCancel
                            } else {
                                null
                            },
                    )
                is ChatMessage.HermesSteps -> HermesSteps(message.steps, message.running)
                is ChatMessage.Error -> ErrorBubble(message, onRetry = if (state.pending == null) ({ onRetry(message.id) }) else null)
            }
        }
    }
}

@Composable
private fun ChatField(
    state: ChatUiState,
    prompt: String,
    onPrompt: (String) -> Unit,
    canSend: Boolean,
    onSubmit: () -> Unit,
    onClearWindow: () -> Unit,
    composerActions: @Composable RowScope.() -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val window = state.freeWindow
    val lastIsError = state.messages.lastOrNull() is ChatMessage.Error
    val mark =
        if (state.pending != null) {
            BotState.Thinking
        } else if (lastIsError) {
            BotState.Error
        } else {
            BotState.Idle
        }
    val status =
        when {
            state.pending != null -> "${state.pending.label ?: "Pensando"}…"
            lastIsError -> "Não deu certo"
            else -> "Esperando o seu pedido"
        }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    Column(Modifier.fillMaxWidth().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            Modifier.heightIn(min = 28.dp).padding(start = 6.dp).semantics { liveRegion = LiveRegionMode.Polite },
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HermesBotIcon(mark, size = 22.dp, color = if (mark == BotState.Error) scheme.error else scheme.onSurfaceVariant)
            Text(
                text = status,
                color =
                    if (mark ==
                        BotState.Error
                    ) {
                        scheme.error
                    } else {
                        scheme.onSurfaceVariant
                    },
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
        Column(
            Modifier
                .fillMaxWidth()
                .background(scheme.surface, RoundedCornerShape(28.dp))
                .border(1.dp, if (focused) braidBrand() else scheme.outline, RoundedCornerShape(28.dp))
                .padding(6.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (window != null) WindowChip(window, state.todayKey, onClearWindow)
            Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                BasicTextField(
                    value = prompt,
                    onValueChange = onPrompt,
                    enabled = state.ready,
                    maxLines = 5,
                    interactionSource = interaction,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, lineHeight = 22.sp, color = scheme.onBackground),
                    cursorBrush = SolidColor(braidBrand()),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { if (canSend) onSubmit() }),
                    modifier = Modifier.weight(1f).semantics { contentDescription = "Mensagem para a IA" },
                    decorationBox = { inner ->
                        Box(Modifier.heightIn(min = 44.dp).padding(vertical = 11.dp), contentAlignment = Alignment.CenterStart) {
                            if (prompt.isEmpty()) {
                                Text(
                                    text = if (window != null) "Diga o que quer fazer nesse tempo" else "Diga ou escreva o que precisa",
                                    color = scheme.outlineVariant,
                                    fontSize = 15.sp,
                                    lineHeight = 22.sp,
                                )
                            }
                            inner()
                        }
                    },
                )
                composerActions()
                Box(
                    Modifier
                        .size(44.dp)
                        .background(if (canSend) scheme.primary else androidx.compose.ui.graphics.Color.Transparent, CircleShape)
                        .then(if (canSend) Modifier else Modifier.border(1.dp, scheme.outline, CircleShape))
                        .clickable(enabled = canSend, role = Role.Button, onClick = onSubmit)
                        .semantics { contentDescription = if (state.pending != null) "Aguardando a resposta" else "Enviar mensagem" },
                    contentAlignment = Alignment.Center,
                ) {
                    SvgIcon(
                        ChatIcons.arrowUp,
                        size = 20.dp,
                        color = if (canSend) scheme.onPrimary else scheme.outlineVariant,
                        strokeWidth = 2f,
                    )
                }
            }
        }
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
        ) { SvgIcon(ChatIcons.plus, size = 20.dp, color = brand, strokeWidth = 1.75f) }
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
            text = durationShort(window.minutes),
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
        ) { SvgIcon(ChatIcons.close, size = 20.dp, color = scheme.onSurfaceVariant, strokeWidth = 2f) }
    }
}

/** "2h 30min", "45min": a duração no chip da janela. */
private fun durationShort(minutes: Int): String {
    val hours = minutes / 60
    val rest = minutes % 60
    return listOfNotNull(if (hours > 0) "${hours}h" else null, if (rest > 0) "${rest}min" else null).joinToString(" ")
}
