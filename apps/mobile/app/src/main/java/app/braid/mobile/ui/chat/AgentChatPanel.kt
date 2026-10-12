@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.chat

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.core.designsystem.braidBrandSoft
import app.braid.mobile.data.dto.AgentChatEntityRefDto
import app.braid.mobile.ui.hub.HubSquareButton
import app.braid.mobile.ui.hub.HubTextBox

private val CHAT_SUGGESTIONS = listOf("O que tenho na agenda hoje?", "Criar uma tarefa", "Anotar uma ideia")

/**
 * O “Chat com IA” do hub, como `AgentChatPanel` (`mockups/eventos/agent-chat-panel.tsx`):
 * cabeçalho com as conversas e “nova”, boas-vindas com sugestões, o registro da
 * conversa e o compositor com a mesma caixa do web. Vive dentro do painel do hub,
 * sem barra própria.
 */
@Composable
fun AgentChatPanel(
    viewModel: AgentChatViewModel,
    modifier: Modifier = Modifier,
    onEntitiesChanged: () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var prompt by remember { mutableStateOf("") }
    var historyOpen by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val currentConversation = state.conversations.firstOrNull { it.id == state.conversationId }

    LaunchedEffect(state.messages.size, state.pending) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
    }
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            if (effect is AgentChatUiEffect.EntitiesChanged) onEntitiesChanged()
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        ChatHeader(
            title = currentConversation?.title ?: currentConversation?.preview ?: "Nova conversa",
            historyOpen = historyOpen,
            canStartNew = state.pending == null,
            onToggleHistory = { historyOpen = !historyOpen },
            onNew = {
                historyOpen = false
                viewModel.startNewConversation()
            },
        )
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                historyOpen ->
                    ConversationHistory(
                        state = state,
                        onOpen = {
                            viewModel.openConversation(it)
                            historyOpen = false
                        },
                        onDelete = viewModel::deleteConversation,
                        onLoadMore = viewModel::loadMoreConversations,
                    )
                state.messages.isEmpty() -> ChatWelcome(onSuggestion = { prompt = it })
                else ->
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        state = listState,
                        contentPadding = PaddingValues(bottom = 14.dp),
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
        ChatComposer(
            value = prompt,
            enabled = state.pending == null,
            pending = state.pending,
            onValueChange = { prompt = it.take(4000) },
            onSend = {
                if (prompt.isNotBlank()) {
                    viewModel.send(prompt)
                    prompt = ""
                }
            },
            onCancel = viewModel::cancel,
        )
    }
}

/** `.chatHeader`: o botão com a conversa atual (abre a lista) e o “+” de nova conversa. */
@Composable
private fun ChatHeader(
    title: String,
    historyOpen: Boolean,
    canStartNew: Boolean,
    onToggleHistory: () -> Unit,
    onNew: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier =
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .border(BorderStroke(1.dp, colors.outline), RoundedCornerShape(10.dp))
                    .clickable(onClickLabel = "Suas conversas", onClick = onToggleHistory)
                    .padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Outlined.History,
                contentDescription = "Suas conversas",
                modifier = Modifier.size(15.dp),
                tint = if (historyOpen) braidBrand() else colors.onSurface,
            )
            Text(text = title, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(
            modifier =
                Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(braidBrandSoft().copy(alpha = if (canStartNew) 1f else 0.4f))
                    .clickable(enabled = canStartNew, onClickLabel = "Nova conversa", onClick = onNew),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideIcons.plus(),
                contentDescription = "Nova conversa",
                modifier = Modifier.size(15.dp),
                tint = braidBrand().copy(alpha = if (canStartNew) 1f else 0.4f),
            )
        }
    }
}

@Composable
private fun ConversationHistory(
    state: AgentChatUiState,
    onOpen: (String) -> Unit,
    onDelete: (String) -> Unit,
    onLoadMore: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        when {
            state.conversations.isEmpty() && state.isLoadingConversations ->
                Text("Carregando conversas…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.conversations.isEmpty() ->
                Text("Nenhuma conversa ainda.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> {
                LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(state.conversations, key = { it.id }) { conversation ->
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .clip(MaterialTheme.shapes.medium)
                                    .clickable { onOpen(conversation.id) },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f).padding(horizontal = 10.dp, vertical = 8.dp)) {
                                Text(conversation.title ?: conversation.preview, maxLines = 1, fontSize = 13.sp)
                                Text(
                                    text = conversation.lastMessageAt,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            IconButton(onClick = { onDelete(conversation.id) }, enabled = state.pending == null) {
                                Icon(
                                    Icons.Outlined.Delete,
                                    contentDescription = "Apagar conversa",
                                    modifier = Modifier.size(18.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    if (state.conversationsNextCursor != null) {
                        item {
                            TextButton(onClick = onLoadMore, enabled = !state.isLoadingConversations) {
                                Text(if (state.isLoadingConversations) "Carregando…" else "Carregar mais")
                            }
                        }
                    }
                }
            }
        }
    }
}

/** `.assistantWelcome` e `.promptSuggestions`. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChatWelcome(onSuggestion: (String) -> Unit) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 15.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = LucideIcons.braidAssistant(1.2f),
            contentDescription = null,
            tint = braidBrand(),
            modifier = Modifier.size(34.dp),
        )
        Text(
            text = "O que vamos fazer?",
            modifier = Modifier.padding(top = 12.dp),
            fontSize = 21.sp,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = "Pergunte sobre o seu dia ou peça para criar eventos, tarefas e notas.",
            modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
            fontSize = 13.sp,
            lineHeight = 22.sp,
            textAlign = TextAlign.Center,
            color = colors.onSurfaceVariant,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CHAT_SUGGESTIONS.forEach { suggestion ->
                Text(
                    modifier =
                        Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .border(BorderStroke(1.dp, colors.outline), RoundedCornerShape(10.dp))
                            .clickable { onSuggestion(suggestion) }
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                    text = suggestion,
                    fontSize = 11.sp,
                    color = braidBrand(),
                )
            }
        }
    }
}

/** `.hubComposer`: a caixa do web, com o botão de enviar (ou de parar a resposta) dentro dela. */
@Composable
private fun ChatComposer(
    value: String,
    enabled: Boolean,
    pending: AgentChatPendingUi?,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancel: () -> Unit,
) {
    HubTextBox(
        modifier = Modifier.fillMaxWidth(),
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        placeholder = "Pergunte ou peça para criar…",
        singleLine = false,
        maxLines = 4,
        trailing = {
            if (pending == null) {
                HubSquareButton(
                    icon = LucideIcons.arrowUp(),
                    description = "Enviar mensagem",
                    onClick = onSend,
                    enabled = value.isNotBlank(),
                )
            } else {
                HubSquareButton(
                    icon = Icons.Outlined.Stop,
                    description = "Parar resposta",
                    onClick = onCancel,
                    enabled = !pending.cancelling,
                )
            }
        },
    )
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
