@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.chat

import android.animation.ValueAnimator
import androidx.compose.animation.core.Animatable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidBrandSoft
import app.braid.mobile.data.dto.AgentChatEntityRefDto
import java.time.LocalDate

/** As três vistas do chat; o hub ajusta a altura do painel a elas. */
enum class ChatView { Home, Conversation, List }

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
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var prompt by remember { mutableStateOf("") }
    var listOpen by remember { mutableStateOf(false) }
    var markRun by remember { mutableIntStateOf(0) }
    val listState = rememberLazyListState()
    val currentConversation = state.conversations.firstOrNull { it.id == state.conversationId }
    val view =
        when {
            listOpen -> ChatView.List
            state.isLoadingMessages || state.messages.isNotEmpty() -> ChatView.Conversation
            else -> ChatView.Home
        }
    val command = if (onCommand != null) parseChatCommand(prompt) else null
    val highlighted = command?.matches?.firstOrNull()
    val canStartNew = state.pending == null && !state.isRecoveringJobs
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
        prompt = ""
    }

    Column(modifier = modifier.fillMaxSize()) {
        if (view == ChatView.List) {
            ChatHeaderRow {
                ChatIconButton(LucideIcons.arrowLeft(), "Voltar para o chat", tint = MaterialTheme.colorScheme.onSurface) {
                    listOpen = false
                }
                ChatHeaderTitle("Conversas", fontSize = 17)
                ChatIconButton(LucideIcons.plus(), "Nova conversa", enabled = canStartNew, tint = MaterialTheme.colorScheme.onSurface) {
                    listOpen = false
                    viewModel.startNewConversation()
                }
            }
        } else {
            val buttonAlpha = if (view == ChatView.Home) reveal else 1f
            ChatHeaderRow {
                ChatIconButton(LucideIcons.messagesSquare(), "Todas as conversas", modifier = Modifier.alpha(buttonAlpha)) {
                    listOpen = true
                }
                if (view == ChatView.Conversation) {
                    ChatHeaderTitle(currentConversation?.label() ?: "Nova conversa", fontSize = 14)
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
            }
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 20.dp)) {
            when {
                view == ChatView.List ->
                    ConversationList(
                        state = state,
                        onOpen = {
                            viewModel.openConversation(it)
                            listOpen = false
                        },
                        onDelete = viewModel::deleteConversation,
                        onLoadMore = viewModel::loadMoreConversations,
                    )
                command != null -> CommandList(commands = command.matches, highlighted = highlighted, onRun = ::runCommand)
                view == ChatView.Home ->
                    ChatHome(
                        expanded = expanded,
                        markRun = markRun,
                        onReplay = { markRun++ },
                    )
                state.isLoadingMessages ->
                    Text(
                        text = "Carregando a conversa…",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                else ->
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        state = listState,
                        contentPadding = PaddingValues(top = 8.dp, bottom = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(state.messages, key = { it.id }) { message ->
                            ChatMessageBubble(
                                message = message,
                                onRetry = { viewModel.retry(message.id) },
                                canRetry = state.pending == null,
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

        if (view != ChatView.List) {
            ChatComposer(
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
                value = prompt,
                enabled = state.pending == null && !state.isRecoveringJobs && !state.isLoadingMessages,
                pending = state.pending,
                onValueChange = { prompt = it.take(4000) },
                onSend = {
                    when {
                        highlighted != null -> runCommand(highlighted)
                        prompt.isNotBlank() && !state.isRecoveringJobs && !state.isLoadingMessages -> {
                            viewModel.send(prompt)
                            prompt = ""
                        }
                    }
                },
                onCancel = viewModel::cancel,
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
private fun ChatHeaderRow(content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
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

/** O início: a marca (toque para repetir) e “O que vamos fazer?”, sem sugestões. */
@Composable
private fun ChatHome(
    expanded: Boolean,
    markRun: Int,
    onReplay: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(bottom = if (expanded) 64.dp else 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(22.dp, Alignment.Bottom),
    ) {
        // Só a trança ocupa lugar; os fios soltos sobem por cima do cabeçalho.
        Box(
            modifier =
                Modifier
                    .height(74.dp)
                    .wrapContentHeight(align = Alignment.Bottom, unbounded = true)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClickLabel = "Repetir a animação da marca",
                        onClick = onReplay,
                    ),
        ) {
            androidx.compose.runtime.key(markRun, expanded) {
                BraidMark(tail = if (expanded) BRAID_TAIL_FULL else BRAID_TAIL_PANEL)
            }
        }
        Text(
            modifier = Modifier.semantics { heading() },
            text = "O que vamos fazer?",
            fontFamily = BraidDisplayFont,
            fontSize = 36.sp,
            lineHeight = 36.sp,
            textAlign = TextAlign.Center,
        )
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
        ChatCommand.Task -> LucideIcons.squareCheck()
        ChatCommand.Event -> LucideIcons.calendarDays()
        ChatCommand.Note -> LucideIcons.notepadText()
        ChatCommand.Search -> LucideIcons.search()
    }

/** A lista de conversas por Hoje, Esta semana e Antes, como a tela “Conversas” do design. */
@Composable
private fun ConversationList(
    state: AgentChatUiState,
    onOpen: (String) -> Unit,
    onDelete: (String) -> Unit,
    onLoadMore: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val today = remember { LocalDate.now() }
    when {
        state.conversations.isEmpty() && state.isLoadingConversations ->
            Text("Carregando conversas…", fontSize = 13.sp, color = colors.onSurfaceVariant)
        state.conversations.isEmpty() ->
            Text("Nenhuma conversa ainda.", fontSize = 13.sp, color = colors.onSurfaceVariant)
        else ->
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 16.dp)) {
                groupConversations(state.conversations, today).forEachIndexed { index, group ->
                    item(key = "group:${group.label}") {
                        Row(
                            modifier = Modifier.padding(top = if (index == 0) 0.dp else 18.dp, bottom = 2.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            Text(
                                text = group.label.label.uppercase(),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                letterSpacing = 1.3.sp,
                            )
                            Text(text = "${group.items.size}", fontSize = 12.sp, color = colors.onSurfaceVariant)
                        }
                    }
                    items(group.items, key = { it.id }) { conversation ->
                        val current = conversation.id == state.conversationId
                        if (conversation != group.items.first()) HorizontalDivider(color = colors.outline)
                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(
                                modifier =
                                    Modifier
                                        .weight(1f)
                                        .heightIn(min = 64.dp)
                                        .clickable(enabled = state.pending == null, onClickLabel = conversation.label()) {
                                            onOpen(conversation.id)
                                        }.padding(vertical = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(
                                        modifier = Modifier.weight(1f, fill = false),
                                        text = conversation.label(),
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (current) {
                                        Icon(
                                            imageVector = LucideIcons.check(2f),
                                            contentDescription = "Conversa atual",
                                            tint = braidBrand(),
                                            modifier = Modifier.size(16.dp),
                                        )
                                    }
                                }
                                if (conversation.title != null && conversation.preview != conversation.title) {
                                    Text(
                                        text = conversation.preview,
                                        fontSize = 13.sp,
                                        color = colors.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            Text(
                                modifier = Modifier.padding(top = 14.dp),
                                text = conversationTime(conversation.lastMessageAt, today),
                                fontSize = 12.sp,
                                color = colors.onSurfaceVariant,
                            )
                            Box(
                                modifier =
                                    Modifier
                                        .padding(top = 7.dp)
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .clickable(enabled = state.pending == null, onClickLabel = "Apagar conversa") {
                                            onDelete(conversation.id)
                                        }.semantics { contentDescription = "Apagar conversa: ${conversation.label()}" },
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = LucideIcons.trash2(),
                                    contentDescription = null,
                                    tint = colors.onSurfaceVariant,
                                    modifier = Modifier.size(15.dp),
                                )
                            }
                        }
                    }
                }
                if (state.conversationsNextCursor != null) {
                    item(key = "more") {
                        TextButton(onClick = onLoadMore, enabled = !state.isLoadingConversations) {
                            Text(if (state.isLoadingConversations) "Carregando…" else "Carregar mais", color = braidBrand())
                        }
                    }
                }
            }
    }
}

/**
 * `.chatComposer`: o campo sublinhado do design, com o fio na cor da marca
 * enquanto tem o foco. À direita, enviar quando há texto e parar quando a IA
 * está respondendo. A voz fica na barra da agenda, como antes.
 */
@Composable
private fun ChatComposer(
    value: String,
    enabled: Boolean,
    pending: AgentChatPendingUi?,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val line = if (focused) braidBrand() else colors.outlineVariant
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .drawBehind {
                    val stroke = (if (focused) 2.dp else 1.dp).toPx()
                    drawLine(line, Offset(0f, size.height - stroke / 2), Offset(size.width, size.height - stroke / 2), stroke)
                },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        BasicTextField(
            modifier = Modifier.weight(1f).semantics { contentDescription = "Mensagem para a IA" },
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
                Box(modifier = Modifier.padding(vertical = 12.dp)) {
                    if (value.isEmpty()) {
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
        when {
            pending != null ->
                ChatIconButton(Icons.Outlined.Stop, "Parar resposta", enabled = !pending.cancelling, onClick = onCancel)
            value.isNotBlank() ->
                ChatIconButton(LucideIcons.arrowUp(2f), "Enviar mensagem", tint = braidBrand(), onClick = onSend)
            else -> Spacer(modifier = Modifier.width(0.dp))
        }
    }
}

/** `.chatBubble`: o balão da pessoa na cor suave da marca, a IA sem fundo e o erro avermelhado. */
@Composable
private fun ChatMessageBubble(
    message: AgentChatUiMessage,
    onRetry: () -> Unit,
    canRetry: Boolean,
) {
    val colors = MaterialTheme.colorScheme
    val isUser = message.role == AgentChatMessageRole.User
    val isError = message.role == AgentChatMessageRole.Error
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        when {
            isUser ->
                Text(
                    modifier =
                        Modifier
                            .fillMaxWidth(0.85f)
                            .background(braidBrandSoft(), RoundedCornerShape(14.dp, 14.dp, 4.dp, 14.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    text = message.text,
                    fontSize = 13.sp,
                    lineHeight = 21.sp,
                )
            isError ->
                Text(
                    modifier =
                        Modifier
                            .fillMaxWidth(0.92f)
                            .background(colors.error.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
                            .border(BorderStroke(1.dp, colors.error.copy(alpha = 0.4f)), RoundedCornerShape(14.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    text = message.text,
                    fontSize = 12.sp,
                    color = colors.error,
                )
            else ->
                Text(
                    modifier = Modifier.fillMaxWidth(0.92f).padding(end = 2.dp),
                    text = message.text,
                    fontSize = 13.sp,
                    lineHeight = 21.sp,
                )
        }
        if (message.entities.isNotEmpty()) {
            Column(
                modifier = Modifier.padding(top = 8.dp),
                horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                message.entities.forEach { entity -> EntityChip(entity) }
            }
        }
        if (isError && canRetry && message.retryText.isNotBlank()) {
            TextButton(onClick = onRetry) { Text("Tentar novamente", color = braidBrand(), fontSize = 12.sp) }
        }
    }
}

/** `.chatEntities li`: pílula de fio, na cor da marca quando o registro foi criado. */
@Composable
private fun EntityChip(entity: AgentChatEntityRefDto) {
    val created = entity.change == "created"
    val color = if (created) braidBrand() else MaterialTheme.colorScheme.onSurfaceVariant
    Text(
        modifier =
            Modifier
                .border(
                    BorderStroke(1.dp, if (created) braidBrand().copy(alpha = 0.4f) else MaterialTheme.colorScheme.outline),
                    CircleShape,
                ).padding(horizontal = 9.dp, vertical = 4.dp),
        text = entityChipText(entity),
        fontSize = 11.sp,
        color = color,
    )
}

private fun entityChipText(entity: AgentChatEntityRefDto): String {
    val noun =
        when (entity.kind) {
            "event" -> "Evento"
            "task" -> "Tarefa"
            "note" -> "Nota"
            else -> entity.kind
        }
    val verb =
        when (entity.change) {
            "created" -> "criado"
            "updated" -> "alterado"
            "deleted" -> "apagado"
            else -> entity.change
        }
    return entity.label?.let { "$noun $verb · $it" } ?: "$noun $verb"
}
