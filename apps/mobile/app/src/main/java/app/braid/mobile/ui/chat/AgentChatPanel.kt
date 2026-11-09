@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.chat

import android.animation.ValueAnimator
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidBrandAccent
import app.braid.mobile.core.designsystem.braidOnBrand
import app.braid.mobile.data.dto.AgentChatEntityRefDto

/** As três vistas do chat; o hub ajusta a altura do painel a elas. */
enum class ChatView { Home, Conversation }

/** Para onde um registro da resposta leva no app. */
sealed interface ChatEntityTarget {
    data class Event(
        val id: String,
    ) : ChatEntityTarget

    data class Note(
        val id: String,
    ) : ChatEntityTarget
}

/**
 * A tela do registro que a resposta tocou, como `agentEntityHref` do web. O apagado não
 * tem para onde ir, e tarefa ainda não tem tela própria no app: as duas ficam só como texto.
 */
fun AgentChatEntityRefDto.openTarget(): ChatEntityTarget? =
    when {
        change == "deleted" -> null
        kind == "event" -> ChatEntityTarget.Event(id)
        kind == "note" -> ChatEntityTarget.Note(id)
        else -> null
    }

/** "Evento alterado", "Tarefa criada": o que aconteceu com o registro, como `CHANGE_LABELS` do web. */
fun entityChangeText(entity: AgentChatEntityRefDto): String {
    val feminine = entity.kind == "task" || entity.kind == "note"
    val noun =
        when (entity.kind) {
            "event" -> "Evento"
            "task" -> "Tarefa"
            "note" -> "Nota"
            else -> entity.kind
        }
    val verb =
        when (entity.change) {
            "created" -> if (feminine) "criada" else "criado"
            "updated" -> if (feminine) "alterada" else "alterado"
            "deleted" -> if (feminine) "apagada" else "apagado"
            else -> entity.change
        }
    return "$noun $verb"
}

/** O texto inteiro do registro, como `entityChipText` do web: "Tarefa criada · Limpar a casa". */
fun entityChipText(entity: AgentChatEntityRefDto): String =
    entity.label?.let { "${entityChangeText(entity)} · $it" } ?: entityChangeText(entity)

/** Os atalhos da caixa de mensagem: escrevem o comando no campo, como digitar "/". */
private val COMPOSER_COMMANDS = ChatCommand.entries.filter { it != ChatCommand.Search }

/**
 * O “Chat com IA” do hub, como `AgentChatPanel` (`mockups/eventos/agent-chat-panel.tsx`):
 * o início (marca, pergunta e campo), a conversa e a lista de conversas. Criar e
 * pesquisar saem do próprio campo, pela barra "/" (`onCommand`).
 */
@Composable
fun AgentChatPanel(
    viewModel: AgentChatViewModel,
    modifier: Modifier = Modifier,
    expanded: Boolean = false,
    onToggleExpanded: (() -> Unit)? = null,
    onCommand: ((ChatCommand, String) -> Unit)? = null,
    onViewChange: (ChatView) -> Unit = {},
    onEntitiesChanged: () -> Unit = {},
    onClose: (() -> Unit)? = null,
    onOpenEntity: ((ChatEntityTarget) -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // TextFieldValue, não String: o atalho de comando põe o cursor depois do que escreveu.
    var field by remember { mutableStateOf(TextFieldValue("")) }
    val prompt = field.text
    val focusRequester = remember { FocusRequester() }
    val listState = rememberLazyListState()
    val view =
        when {
            state.messages.isNotEmpty() -> ChatView.Conversation
            else -> ChatView.Home
        }
    val command = if (onCommand != null) parseChatCommand(prompt) else null
    val highlighted = command?.matches?.firstOrNull()
    val canStartNew = state.pending == null
    val reveal = rememberHomeReveal()

    LaunchedEffect(view) { onViewChange(view) }
    LaunchedEffect(state.messages.size, state.pending) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
    }
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            if (effect is AgentChatUiEffect.EntitiesChanged) onEntitiesChanged()
        }
    }

    fun runCommand(target: ChatCommand) {
        onCommand?.invoke(target, command?.argument.orEmpty())
        field = TextFieldValue("")
    }

    Column(modifier = modifier.fillMaxSize()) {
        val buttonAlpha = if (view == ChatView.Home) reveal else 1f
        ChatHeaderRow(divider = view == ChatView.Conversation) {
            if (view == ChatView.Conversation) {
                ChatIconButton(
                    LucideIcons.plus(),
                    "Nova conversa",
                    enabled = canStartNew,
                    tint = MaterialTheme.colorScheme.onSurface,
                ) {
                    viewModel.startNewConversation()
                }
                ChatConversationTitle("Conversa", busy = state.pending != null)
            } else {
                Spacer(modifier = Modifier.weight(1f))
            }
            if (onToggleExpanded != null) {
                ChatIconButton(
                    icon = if (expanded) LucideIcons.minimize2() else LucideIcons.maximize2(),
                    description = if (expanded) "Recolher para o painel" else "Expandir para tela inteira",
                    modifier = Modifier.alpha(buttonAlpha),
                    onClick = onToggleExpanded,
                )
            }
            if (onClose != null) {
                ChatIconButton(LucideIcons.close(), "Fechar o chat", modifier = Modifier.alpha(buttonAlpha), onClick = onClose)
            }
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 20.dp)) {
            when {
                command != null -> CommandList(commands = command.matches, highlighted = highlighted, onRun = ::runCommand)
                view == ChatView.Home ->
                    ChatHome(
                        expanded = expanded,
                        onCommand = onCommand,
                    )
                else ->
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        state = listState,
                        contentPadding = PaddingValues(top = 12.dp, bottom = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        items(state.messages, key = { it.id }) { message ->
                            ChatMessageBubble(
                                message = message,
                                onRetry = { viewModel.retry(message.id) },
                                canRetry = state.pending == null,
                                onOpenEntity = onOpenEntity,
                            )
                        }
                        state.pending?.let { pending ->
                            item(key = "pending") {
                                Text(
                                    text = "${pending.label ?: "Pensando"}…",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
            }
        }

        run {
            ChatComposer(
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
                value = field,
                enabled = state.pending == null,
                pending = state.pending,
                focusRequester = focusRequester,
                shortcuts = if (onCommand != null && view == ChatView.Conversation) COMPOSER_COMMANDS else emptyList(),
                onValueChange = { next ->
                    field = if (next.text.length > 4000) TextFieldValue(next.text.take(4000), TextRange(4000)) else next
                },
                onShortcut = { shortcut ->
                    val text = "/${shortcut.slug} "
                    field = TextFieldValue(text, TextRange(text.length))
                    focusRequester.requestFocus()
                },
                onSend = {
                    when {
                        highlighted != null -> runCommand(highlighted)
                        prompt.isNotBlank() -> {
                            viewModel.send(prompt)
                            field = TextFieldValue("")
                        }
                    }
                },
            )
        }
    }
}

/**
 * Os botões do início só aparecem depois que a marca termina de se trançar
 * (`data-reveal` do web, 2,25 s); com as animações do sistema desligadas, já estão lá.
 */
@Composable
private fun rememberHomeReveal(): Float {
    val animate = remember { ValueAnimator.areAnimatorsEnabled() }
    val alpha = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(alpha) {
        if (animate) alpha.animateTo(1f, tween(durationMillis = 300, delayMillis = 2250))
    }
    return alpha.value
}

@Composable
private fun ChatHeaderRow(
    divider: Boolean = false,
    content: @Composable RowScope.() -> Unit,
) {
    val line = MaterialTheme.colorScheme.outline
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .drawBehind {
                    if (divider) {
                        val stroke = 1.dp.toPx()
                        drawLine(line, Offset(0f, size.height - stroke / 2), Offset(size.width, size.height - stroke / 2), stroke)
                    }
                }.padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
}

/** O título da conversa com quem responde em cima (`.chatTitle` + `.chatLive` do web). */
@Composable
private fun RowScope.ChatConversationTitle(
    title: String,
    busy: Boolean,
) {
    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        ChatLiveLabel(text = "Assistente", busy = busy)
        Text(
            modifier = Modifier.semantics { heading() },
            text = title,
            fontSize = 15.sp,
            lineHeight = 19.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** O ponto da marca com o halo e o nome em caixa alta; o ponto pulsa enquanto a resposta não chega. */
@Composable
private fun ChatLiveLabel(
    text: String,
    busy: Boolean,
) {
    val brand = braidBrand()
    val animate = remember { ValueAnimator.areAnimatorsEnabled() }
    val pulse =
        if (busy && animate) {
            val transition = rememberInfiniteTransition(label = "chatLive")
            transition
                .animateFloat(
                    initialValue = 1f,
                    targetValue = 0.35f,
                    animationSpec = infiniteRepeatable(tween(durationMillis = 700), RepeatMode.Reverse),
                    label = "chatLiveDot",
                ).value
        } else {
            1f
        }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Box(modifier = Modifier.size(12.dp), contentAlignment = Alignment.Center) {
            Box(modifier = Modifier.size(12.dp).background(brand.copy(alpha = 0.22f), CircleShape))
            Box(modifier = Modifier.size(6.dp).alpha(pulse).background(brand, CircleShape))
        }
        Text(
            text = text.uppercase(),
            fontSize = 11.sp,
            lineHeight = 13.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 1.3.sp,
            color = braidBrandAccent(),
        )
    }
}

@Composable
private fun RowScope.ChatHeaderTitle(
    text: String,
    fontSize: Int,
) {
    Text(
        modifier = Modifier.weight(1f).semantics { heading() },
        text = text,
        fontSize = fontSize.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** `.chatIconButton`: alvo de 44 dp, ícone de 20 sem fundo. */
@Composable
private fun ChatIconButton(
    icon: ImageVector,
    description: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurfaceVariant,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            modifier
                .size(44.dp)
                .clip(CircleShape)
                .clickable(enabled = enabled, onClickLabel = description, onClick = onClick)
                .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint.copy(alpha = if (enabled) 1f else 0.4f),
            modifier = Modifier.size(20.dp),
        )
    }
}

/** O início: “O que vamos fazer?” e as pílulas de criar, sem marca. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChatHome(
    expanded: Boolean,
    onCommand: ((ChatCommand, String) -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(bottom = if (expanded) 64.dp else 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(22.dp, Alignment.CenterVertically),
    ) {
        Text(
            modifier = Modifier.semantics { heading() },
            text = "O que vamos fazer?",
            fontFamily = BraidDisplayFont,
            fontSize = 36.sp,
            lineHeight = 36.sp,
            textAlign = TextAlign.Center,
        )
        // `.createActions`: criar e pesquisar sem digitar "/".
        if (onCommand != null) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ChatCommand.entries.forEach { command ->
                    Row(
                        modifier =
                            Modifier
                                .heightIn(min = 40.dp)
                                .clip(CircleShape)
                                .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), CircleShape)
                                .clickable(onClickLabel = command.label) { onCommand(command, "") }
                                .padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = command.icon(),
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(text = command.label, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}

/** `.chatCommands`: o que a barra "/" oferece, o primeiro realçado (é o que o Enviar roda). */
@Composable
private fun CommandList(
    commands: List<ChatCommand>,
    highlighted: ChatCommand?,
    onRun: (ChatCommand) -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = Modifier.fillMaxSize().padding(bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.Bottom),
    ) {
        commands.forEach { command ->
            val active = command == highlighted
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 56.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (active) colors.surfaceVariant else androidx.compose.ui.graphics.Color.Transparent)
                        .clickable(onClickLabel = command.label) { onRun(command) }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Icon(
                    imageVector = command.icon(),
                    contentDescription = null,
                    tint = if (active) colors.onSurface else colors.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(text = command.label, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Text(text = command.hint, fontSize = 13.sp, color = colors.onSurfaceVariant)
                }
                Text(text = "/${command.slug}", fontFamily = BraidMonoFont, fontSize = 12.sp, color = colors.onSurfaceVariant)
            }
        }
    }
}

private fun ChatCommand.icon(): ImageVector =
    when (this) {
        ChatCommand.Task -> LucideIcons.listChecks()
        ChatCommand.Event -> LucideIcons.calendarDays()
        ChatCommand.Note -> LucideIcons.fileText()
        ChatCommand.Search -> LucideIcons.search()
    }

/**
 * `.chatComposer`: a caixa de mensagem, com o fio na cor da marca enquanto tem o
 * foco. Em cima o campo; embaixo os atalhos de comando, e à direita o enviar (o
 * círculo da marca), desligado enquanto a IA responde. A voz fica na barra da
 * agenda, como antes.
 */
@Composable
private fun ChatComposer(
    value: TextFieldValue,
    enabled: Boolean,
    pending: AgentChatPendingUi?,
    focusRequester: FocusRequester,
    shortcuts: List<ChatCommand>,
    onValueChange: (TextFieldValue) -> Unit,
    onShortcut: (ChatCommand) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(14.dp)
    val boxModifier =
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surfaceVariant)
            .border(BorderStroke(1.dp, if (focused) braidBrand() else colors.outline), shape)
    val action: @Composable () -> Unit = {
        when {
            pending != null -> SendButton(enabled = false, onClick = onSend)
            // Numa linha só (o início), o enviar aparece com o texto, como antes; com os atalhos fica sempre.
            shortcuts.isNotEmpty() || value.text.isNotBlank() ->
                SendButton(enabled = enabled && value.text.isNotBlank(), onClick = onSend)
        }
    }
    val field: @Composable (Modifier) -> Unit = { fieldModifier ->
        ComposerField(value, enabled, focusRequester, interaction, onValueChange, onSend, fieldModifier)
    }
    if (shortcuts.isEmpty()) {
        Row(
            modifier = boxModifier.heightIn(min = 52.dp).padding(start = 14.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            field(Modifier.weight(1f))
            action()
        }
        return
    }
    Column(modifier = boxModifier.padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 4.dp)) {
        field(Modifier.fillMaxWidth())
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            shortcuts.forEach { shortcut ->
                CommandShortcut(shortcut = shortcut, enabled = enabled, onClick = { onShortcut(shortcut) })
            }
            Spacer(modifier = Modifier.weight(1f))
            action()
        }
    }
}

/** O campo da caixa de mensagem, com o texto de ajuda enquanto está vazio. */
@Composable
private fun ComposerField(
    value: TextFieldValue,
    enabled: Boolean,
    focusRequester: FocusRequester,
    interaction: MutableInteractionSource,
    onValueChange: (TextFieldValue) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier,
) {
    val colors = MaterialTheme.colorScheme
    BasicTextField(
        modifier =
            modifier
                .focusRequester(focusRequester)
                .semantics { contentDescription = "Mensagem para a IA" },
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        maxLines = 4,
        interactionSource = interaction,
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.onSurface, fontSize = 16.sp),
        cursorBrush = SolidColor(braidBrand()),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
        keyboardActions = KeyboardActions(onSend = { onSend() }),
        decorationBox = { inner ->
            Box(modifier = Modifier.padding(vertical = 8.dp)) {
                if (value.text.isEmpty()) {
                    Text(
                        text = "Pergunte ou digite / para comandos",
                        style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp),
                        color = colors.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                inner()
            }
        },
    )
}

/** `.chatComposerCommands button`: `/tarefa`, `/evento`, `/nota` em mono, com fio. */
@Composable
private fun CommandShortcut(
    shortcut: ChatCommand,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(7.dp)
    Box(
        modifier =
            Modifier
                .heightIn(min = 32.dp)
                .clip(shape)
                .border(BorderStroke(1.dp, colors.outline), shape)
                .clickable(enabled = enabled, onClickLabel = shortcut.label, onClick = onClick)
                .padding(horizontal = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "/${shortcut.slug}",
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            color = colors.onSurfaceVariant.copy(alpha = if (enabled) 1f else 0.4f),
        )
    }
}

/** O enviar: o círculo da marca de 36 dp dentro do alvo de 44, apagado enquanto não há texto. */
@Composable
private fun SendButton(
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .clickable(enabled = enabled, onClickLabel = "Enviar mensagem", onClick = onClick)
                .semantics { contentDescription = "Enviar mensagem" },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier =
                Modifier
                    .size(36.dp)
                    .alpha(if (enabled) 1f else 0.4f)
                    .clip(CircleShape)
                    .background(braidBrand()),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideIcons.arrowUp(2.2f),
                contentDescription = null,
                tint = braidOnBrand(),
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/**
 * `.chatBubble`: o pedido é um bloco de largura inteira, com fio, como no Hermes; a
 * resposta é texto solto e o erro fica avermelhado.
 */

/** Linhas em branco separam parágrafos; quebras simples ficam dentro do parágrafo (`splitParagraphs` do web). */
internal fun splitParagraphs(text: String): List<String> =
    text
        .split(Regex("\\n\\s*\\n"))
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .ifEmpty { listOf(text) }

@Composable
private fun ChatMessageBubble(
    message: AgentChatUiMessage,
    onRetry: () -> Unit,
    canRetry: Boolean,
    onOpenEntity: ((ChatEntityTarget) -> Unit)?,
) {
    val colors = MaterialTheme.colorScheme
    val isUser = message.role == AgentChatMessageRole.User
    val isError = message.role == AgentChatMessageRole.Error
    if (message.role == AgentChatMessageRole.Process) {
        ProcessBox(message.process, Modifier.fillMaxWidth(), onOpenEntity = onOpenEntity)
        return
    }
    val blockShape = RoundedCornerShape(8.dp)
    Column(modifier = Modifier.fillMaxWidth()) {
        when {
            isUser ->
                Text(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .clip(blockShape)
                            .background(colors.surfaceVariant)
                            .border(BorderStroke(1.dp, colors.outline), blockShape)
                            .padding(horizontal = 13.dp, vertical = 11.dp),
                    text = message.text,
                    fontSize = 15.sp,
                    lineHeight = 23.sp,
                )
            isError ->
                Text(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(colors.error.copy(alpha = 0.12f), blockShape)
                            .border(BorderStroke(1.dp, colors.error.copy(alpha = 0.4f)), blockShape)
                            .padding(horizontal = 13.dp, vertical = 11.dp),
                    text = message.text,
                    fontSize = 13.sp,
                    color = colors.error,
                )
            else ->
                Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    splitParagraphs(message.text).forEach { paragraph ->
                        Text(
                            modifier = Modifier.fillMaxWidth(),
                            text = paragraph,
                            fontSize = 15.sp,
                            lineHeight = 22.sp,
                        )
                    }
                }
        }
        if (message.entities.isNotEmpty()) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                message.entities.forEach { entity ->
                    val target = entity.openTarget()
                    EntityRow(entity, onOpen = if (target != null && onOpenEntity != null) ({ onOpenEntity(target) }) else null)
                }
            }
        }
        if (isError && canRetry && message.retryText.isNotBlank()) {
            TextButton(onClick = onRetry) { Text("Tentar novamente", color = braidBrand(), fontSize = 12.sp) }
        }
    }
}

/**
 * `.chatEntityRow`: cada registro da resposta numa linha com fio, o ícone do tipo na cor
 * da marca e a seta quando abre a tela dele. O apagado fica riscado.
 */
@Composable
internal fun EntityRow(
    entity: AgentChatEntityRefDto,
    onOpen: (() -> Unit)?,
) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(8.dp)
    val text =
        buildAnnotatedString {
            withStyle(SpanStyle(color = colors.onSurfaceVariant)) {
                append(entityChangeText(entity))
                if (entity.label != null) append(" · ")
            }
            entity.label?.let { append(it) }
        }
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 40.dp)
                .clip(shape)
                .then(if (onOpen != null) Modifier.clickable(onClickLabel = "Abrir", onClick = onOpen) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = entity.icon(),
            contentDescription = null,
            tint = braidBrand(),
            modifier = Modifier.size(17.dp),
        )
        Text(
            modifier = Modifier.weight(1f),
            text = text,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textDecoration = if (entity.change == "deleted") TextDecoration.LineThrough else null,
        )
        if (onOpen != null) {
            Icon(
                imageVector = LucideIcons.chevronRight(),
                contentDescription = null,
                tint = colors.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

private fun AgentChatEntityRefDto.icon(): ImageVector =
    when (kind) {
        "event" -> LucideIcons.calendarDays()
        "note" -> LucideIcons.fileText()
        else -> LucideIcons.listChecks()
    }
