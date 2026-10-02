package app.braid.mobile.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.chat.AgentChatEvent
import app.braid.mobile.data.chat.AgentChatGateway
import app.braid.mobile.data.chat.AgentChatHistoryGateway
import app.braid.mobile.data.chat.AgentChatHistoryResult
import app.braid.mobile.data.dto.AgentChatEntityRefDto
import app.braid.mobile.data.dto.AgentChatMessageDto
import app.braid.mobile.data.dto.AgentChatMessageFrameDto
import app.braid.mobile.data.dto.AgentConversationDto
import app.braid.mobile.data.dto.AgentScreenContextDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject

enum class AgentChatMessageRole {
    User,
    Assistant,
    Error,
}

data class AgentChatUiMessage(
    val id: String,
    val role: AgentChatMessageRole,
    val text: String,
    val entities: List<AgentChatEntityRefDto> = emptyList(),
    val failed: Boolean = false,
    val retryText: String = "",
    val requestId: String? = null,
)

data class AgentChatPendingUi(
    val id: String,
    val label: String? = null,
    val cancelling: Boolean = false,
)

data class AgentChatUiState(
    val messages: List<AgentChatUiMessage> = emptyList(),
    val pending: AgentChatPendingUi? = null,
    val conversationId: String? = null,
    val conversations: List<AgentConversationDto> = emptyList(),
    val conversationsNextCursor: String? = null,
    val isLoadingConversations: Boolean = false,
    val isLoadingMessages: Boolean = false,
)

sealed interface AgentChatUiEffect {
    data object EntitiesChanged : AgentChatUiEffect
}

@HiltViewModel
class AgentChatViewModel
    @Inject
    constructor(
        private val gateway: AgentChatGateway,
        private val history: AgentChatHistoryGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(AgentChatUiState())
        private val mutableEffects = MutableSharedFlow<AgentChatUiEffect>(extraBufferCapacity = 8)
        private val messageCounter = AtomicLong()

        val state: StateFlow<AgentChatUiState> = mutableState.asStateFlow()
        val effects: SharedFlow<AgentChatUiEffect> = mutableEffects.asSharedFlow()

        init {
            viewModelScope.launch {
                gateway.events.collect(::handleEvent)
            }
            loadConversations()
        }

        fun send(text: String) {
            val trimmed = text.trim()
            if (trimmed.isEmpty() || trimmed.length > MAX_MESSAGE_LENGTH || mutableState.value.pending != null) return

            val id = "m${System.currentTimeMillis().toString(36)}${messageCounter.incrementAndGet().toString(36)}"
            val conversationId = mutableState.value.conversationId
            mutableState.update { current ->
                current.copy(
                    messages = current.messages + AgentChatUiMessage(id, AgentChatMessageRole.User, trimmed),
                    pending = AgentChatPendingUi(id),
                )
            }
            viewModelScope.launch {
                runCatching {
                    gateway.send(
                        AgentChatMessageFrameDto(
                            id = id,
                            text = trimmed,
                            context = AgentScreenContextDto(screen = "agenda"),
                            conversationId = conversationId,
                        ),
                    )
                }.onFailure { handleClientError(id, "connection_failed") }
            }
        }

        fun cancel() {
            val pending = mutableState.value.pending ?: return
            if (pending.cancelling) return
            gateway.cancel(pending.id)
            mutableState.update { it.copy(pending = pending.copy(label = "Cancelando", cancelling = true)) }
        }

        fun retry(messageId: String) {
            val error = mutableState.value.messages.firstOrNull { it.id == messageId } ?: return
            if (error.role != AgentChatMessageRole.Error || mutableState.value.pending != null) return
            mutableState.update { current ->
                current.copy(
                    messages = current.messages.filterNot { it.id == messageId || it.id == error.requestId },
                )
            }
            send(error.retryText)
        }

        fun startNewConversation() {
            if (mutableState.value.pending != null) return
            mutableState.update { current ->
                current.copy(
                    messages = emptyList(),
                    pending = null,
                    conversationId = null,
                    isLoadingMessages = false,
                )
            }
        }

        fun openConversation(conversationId: String) {
            if (mutableState.value.pending != null || mutableState.value.isLoadingMessages) return
            mutableState.update { it.copy(isLoadingMessages = true) }
            viewModelScope.launch {
                when (val result = history.messages(conversationId)) {
                    is AgentChatHistoryResult.Success -> {
                        mutableState.update { current ->
                            current.copy(
                                conversationId = conversationId,
                                messages =
                                    result.value.items
                                        .asReversed()
                                        .map(::toUiMessage),
                                isLoadingMessages = false,
                            )
                        }
                    }

                    is AgentChatHistoryResult.Failure -> mutableState.update { it.copy(isLoadingMessages = false) }
                }
            }
        }

        fun deleteConversation(conversationId: String) {
            if (mutableState.value.pending != null) return
            mutableState.update { current ->
                current.copy(
                    conversations = current.conversations.filterNot { it.id == conversationId },
                    messages = if (current.conversationId == conversationId) emptyList() else current.messages,
                    conversationId = if (current.conversationId == conversationId) null else current.conversationId,
                )
            }
            viewModelScope.launch {
                when (history.delete(conversationId)) {
                    is AgentChatHistoryResult.Success -> Unit
                    is AgentChatHistoryResult.Failure -> loadConversations()
                }
            }
        }

        fun loadMoreConversations() {
            val cursor = mutableState.value.conversationsNextCursor ?: return
            if (mutableState.value.isLoadingConversations) return
            loadConversations(cursor, append = true)
        }

        private fun loadConversations(
            cursor: String? = null,
            append: Boolean = false,
        ) {
            mutableState.update { it.copy(isLoadingConversations = true) }
            viewModelScope.launch {
                when (val result = history.conversations(cursor)) {
                    is AgentChatHistoryResult.Success -> {
                        mutableState.update { current ->
                            val items =
                                if (append) {
                                    (current.conversations + result.value.items).distinctBy(AgentConversationDto::id)
                                } else {
                                    result.value.items
                                }
                            current.copy(
                                conversations = items,
                                conversationsNextCursor = result.value.nextCursor,
                                isLoadingConversations = false,
                            )
                        }
                    }

                    is AgentChatHistoryResult.Failure -> mutableState.update { it.copy(isLoadingConversations = false) }
                }
            }
        }

        private fun handleEvent(event: AgentChatEvent) {
            val pending = mutableState.value.pending ?: return
            val eventId =
                when (event) {
                    is AgentChatEvent.Status -> event.frame.id
                    is AgentChatEvent.Reply -> event.frame.id
                    is AgentChatEvent.Error -> event.id
                }
            if (eventId != pending.id) return

            when (event) {
                is AgentChatEvent.Status -> {
                    if (!pending.cancelling) {
                        mutableState.update { it.copy(pending = pending.copy(label = event.frame.label)) }
                    }
                }

                is AgentChatEvent.Reply -> {
                    mutableState.update { current ->
                        current.copy(
                            conversationId = event.frame.conversationId,
                            pending = null,
                            messages =
                                current.messages +
                                    AgentChatUiMessage(
                                        id = "${event.frame.id}-reply",
                                        role = AgentChatMessageRole.Assistant,
                                        text = event.frame.agentResponse,
                                        entities = event.frame.entities,
                                    ),
                        )
                    }
                    if (event.frame.entities.isNotEmpty()) mutableEffects.tryEmit(AgentChatUiEffect.EntitiesChanged)
                    loadConversations()
                }

                is AgentChatEvent.Error -> handleServerError(event.id, event.code)
            }
        }

        private fun handleClientError(
            id: String,
            code: String,
        ) {
            if (mutableState.value.pending?.id == id) handleServerError(id, code)
        }

        private fun handleServerError(
            id: String,
            code: String,
        ) {
            val current = mutableState.value
            val request = current.messages.firstOrNull { it.id == id && it.role == AgentChatMessageRole.User }
            mutableState.value =
                current.copy(
                    conversationId = if (code == "conversation_gone") null else current.conversationId,
                    pending = null,
                    messages =
                        current.messages.map { message ->
                            if (message.id == id) message.copy(failed = true) else message
                        } +
                            AgentChatUiMessage(
                                id = "$id-error",
                                role = AgentChatMessageRole.Error,
                                text = errorText(code),
                                retryText = request?.text.orEmpty(),
                                requestId = id,
                            ),
                )
            if (code == "connection_lost") mutableEffects.tryEmit(AgentChatUiEffect.EntitiesChanged)
        }

        private companion object {
            const val MAX_MESSAGE_LENGTH = 4000

            fun toUiMessage(message: AgentChatMessageDto): AgentChatUiMessage =
                AgentChatUiMessage(
                    id = message.id,
                    role =
                        if (message.role == "user") {
                            AgentChatMessageRole.User
                        } else {
                            AgentChatMessageRole.Assistant
                        },
                    text = message.content,
                    entities = message.entities,
                )

            fun errorText(code: String): String =
                when (code) {
                    "busy" -> "Ainda estou respondendo a mensagem anterior."
                    "invalid_frame", "invalid_input" -> "Não consegui ler essa mensagem. Tente escrever de outro jeito."
                    "forbidden" -> "Você não tem permissão para acessar esses dados."
                    "limit_reached" -> "O pedido ficou grande demais e nada foi gravado. Tente dividir em partes menores."
                    "conflict" -> "Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo."
                    "conversation_gone" -> "Esta conversa não existe mais. Sua mensagem não foi enviada — comece outra."
                    "unavailable" -> "A IA está indisponível agora. Tente de novo em instantes."
                    "cancelled" -> "Cancelado. Nada foi gravado."
                    "connection_lost" -> "A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar."
                    "connection_failed" -> "Não consegui conectar ao assistente. Tente de novo."
                    "session_expired" -> "Sua sessão acabou. Entre de novo para continuar."
                    else -> "Algo deu errado. Tente de novo."
                }
        }
    }
