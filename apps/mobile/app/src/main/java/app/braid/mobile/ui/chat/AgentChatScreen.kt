@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.dto.AgentChatEntityRefDto

private val CHAT_SUGGESTIONS = listOf("O que tenho na agenda hoje?", "Criar uma tarefa", "Anotar uma ideia")

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun AgentChatScreen(
    modifier: Modifier = Modifier,
    onEntitiesChanged: () -> Unit = {},
    viewModel: AgentChatViewModel,
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

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Chat com a IA")
                        Text(
                            text = currentConversation?.title ?: currentConversation?.preview ?: "Nova conversa",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                },
                actions = {
                    IconButton(onClick = { historyOpen = true }) {
                        Icon(Icons.Outlined.History, contentDescription = "Suas conversas")
                    }
                    IconButton(
                        onClick = { viewModel.startNewConversation() },
                        enabled = state.pending == null,
                    ) {
                        Icon(Icons.Outlined.Add, contentDescription = "Nova conversa")
                    }
                },
            )
        },
        bottomBar = {
            ChatComposer(
                value = prompt,
                enabled = state.pending == null,
                pending = state.pending,
                onValueChange = { prompt = it },
                onSend = {
                    if (prompt.isNotBlank()) {
                        viewModel.send(prompt)
                        prompt = ""
                    }
                },
                onCancel = viewModel::cancel,
            )
        },
    ) { padding ->
        if (state.messages.isEmpty()) {
            ChatWelcome(
                modifier = Modifier.fillMaxSize().padding(padding),
                onSuggestion = { prompt = it },
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                state = listState,
                contentPadding =
                    androidx.compose.foundation.layout
                        .PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
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
                            modifier = Modifier.padding(horizontal = 8.dp),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
    if (historyOpen) {
        ModalBottomSheet(onDismissRequest = { historyOpen = false }) {
            ConversationHistory(
                state = state,
                onOpen = {
                    viewModel.openConversation(it)
                    historyOpen = false
                },
                onDelete = viewModel::deleteConversation,
                onLoadMore = viewModel::loadMoreConversations,
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
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Suas conversas", style = MaterialTheme.typography.headlineSmall)
        if (state.conversations.isEmpty() && state.isLoadingConversations) {
            Text("Carregando conversas…", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else if (state.conversations.isEmpty()) {
            Text("Nenhuma conversa ainda.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            state.conversations.forEach { conversation ->
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { onOpen(conversation.id) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f).padding(vertical = 8.dp)) {
                        Text(conversation.title ?: conversation.preview, maxLines = 1)
                        Text(
                            text = conversation.lastMessageAt,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(
                        onClick = { onDelete(conversation.id) },
                        enabled = state.pending == null,
                    ) {
                        Icon(Icons.Outlined.Delete, contentDescription = "Apagar conversa")
                    }
                }
            }
            if (state.conversationsNextCursor != null) {
                Button(onClick = onLoadMore, enabled = !state.isLoadingConversations) {
                    Text(if (state.isLoadingConversations) "Carregando…" else "Carregar mais")
                }
            }
        }
    }
}

@Composable
private fun ChatWelcome(
    modifier: Modifier,
    onSuggestion: (String) -> Unit,
) {
    Column(
        modifier = modifier.padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.AutoAwesome,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = "O que vamos fazer?",
            modifier = Modifier.padding(top = 12.dp),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = "Pergunte sobre o seu dia ou peça para criar eventos, tarefas e notas.",
            modifier = Modifier.padding(top = 8.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        CHAT_SUGGESTIONS.forEach { suggestion ->
            AssistChip(
                onClick = { onSuggestion(suggestion) },
                label = { Text(suggestion) },
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun ChatComposer(
    value: String,
    enabled: Boolean,
    pending: AgentChatPendingUi?,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancel: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(12.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = { onValueChange(it.take(4000)) },
            modifier = Modifier.weight(1f),
            enabled = enabled,
            placeholder = { Text("Pergunte ou peça para criar…") },
            maxLines = 4,
        )
        IconButton(
            onClick = if (pending == null) onSend else onCancel,
            enabled = pending?.cancelling != true && (pending != null || value.isNotBlank()),
        ) {
            Icon(
                imageVector = if (pending == null) Icons.Outlined.Send else Icons.Outlined.Stop,
                contentDescription = if (pending == null) "Enviar mensagem" else "Parar resposta",
            )
        }
    }
}

@Composable
private fun ChatMessageBubble(
    message: AgentChatUiMessage,
    onRetry: () -> Unit,
    canRetry: Boolean,
) {
    val isUser = message.role == AgentChatMessageRole.User
    val isError = message.role == AgentChatMessageRole.Error
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Card(
            colors =
                CardDefaults.cardColors(
                    containerColor =
                        when {
                            isError -> MaterialTheme.colorScheme.errorContainer
                            isUser -> MaterialTheme.colorScheme.primaryContainer
                            else -> MaterialTheme.colorScheme.surfaceVariant
                        },
                ),
            shape = RoundedCornerShape(18.dp),
        ) {
            Text(
                text = message.text,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                color =
                    if (isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurface,
            )
        }
        if (message.entities.isNotEmpty()) {
            message.entities.forEach { entity ->
                EntityChip(entity)
            }
        }
        if (isError && canRetry && message.retryText.isNotBlank()) {
            Button(onClick = onRetry, modifier = Modifier.padding(top = 4.dp)) {
                Text("Tentar novamente")
            }
        }
    }
}

@Composable
private fun EntityChip(entity: AgentChatEntityRefDto) {
    AssistChip(
        onClick = {},
        label = { Text(entityChipText(entity)) },
        modifier = Modifier.padding(top = 4.dp),
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
