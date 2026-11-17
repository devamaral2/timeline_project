package app.braid.mobile.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.chat.ProcessGateway
import app.braid.mobile.data.chat.ProcessPoll
import app.braid.mobile.data.chat.ProcessStart
import app.braid.mobile.data.dto.AgentChatEntityRefDto
import app.braid.mobile.data.dto.AgentScreenContextDto
import app.braid.mobile.data.dto.AiProcessDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

enum class AgentChatMessageRole {
    User,
    Assistant,
    Error,

    /** A caixa de processo (ADR 003): passos com check; não entra em nenhum histórico. */
    Process,
}

data class AgentChatUiMessage(
    val id: String,
    val role: AgentChatMessageRole,
    val text: String,
    val entities: List<AgentChatEntityRefDto> = emptyList(),
    val failed: Boolean = false,
    val retryText: String = "",
    val requestId: String? = null,
    val process: AiProcessDto? = null,
)

data class AgentChatPendingUi(
    val id: String,
    val label: String? = null,
)

data class AgentChatUiState(
    val messages: List<AgentChatUiMessage> = emptyList(),
    val pending: AgentChatPendingUi? = null,
)

sealed interface AgentChatUiEffect {
    data object EntitiesChanged : AgentChatUiEffect
}

/**
 * A conversa da agenda. Cada pedido vai pela rota de processo (ADR 003): a caixa mostra os passos até o
 * fim. O que está na tela é tudo que existe: nada é recarregado do servidor.
 */
@HiltViewModel
class AgentChatViewModel
    @Inject
    constructor(
        private val processes: ProcessGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(AgentChatUiState())
        private val mutableEffects = MutableSharedFlow<AgentChatUiEffect>(extraBufferCapacity = 8)

        /** Intervalo entre consultas ao processo; os testes o encurtam. */
        internal var processPollMillis = PROCESS_POLL_MILLIS

        val state: StateFlow<AgentChatUiState> = mutableState.asStateFlow()
        val effects: SharedFlow<AgentChatUiEffect> = mutableEffects.asSharedFlow()

        fun send(text: String) {
            val trimmed = text.trim()
            if (trimmed.isEmpty() || trimmed.length > MAX_MESSAGE_LENGTH || mutableState.value.pending != null) return

            val id = UUID.randomUUID().toString()
            mutableState.update { current ->
                current.copy(
                    messages = current.messages + AgentChatUiMessage(id, AgentChatMessageRole.User, trimmed),
                    pending = AgentChatPendingUi(id),
                )
            }
            viewModelScope.launch { runProcess(id, trimmed) }
        }

        /** Segue o processo até o fim: a caixa mostra cada passo com seu estado. */
        private suspend fun runProcess(
            id: String,
            text: String,
        ) {
            val processId =
                when (val start = processes.start(text, AgentScreenContextDto(screen = "agenda"))) {
                    is ProcessStart.Started -> start.processId
                    is ProcessStart.Failed ->
                        return handleError(id, if (start.status == 401) "session_expired" else "connection_failed")
                }
            val boxId = "$id-process"
            mutableState.update { current ->
                current.copy(
                    messages = current.messages + AgentChatUiMessage(boxId, AgentChatMessageRole.Process, ""),
                    pending = AgentChatPendingUi(id, PROCESS_LABEL),
                )
            }
            var failures = 0
            var waited = 0L
            while (mutableState.value.pending?.id == id) {
                when (val poll = processes.get(processId)) {
                    is ProcessPoll.View -> {
                        failures = 0
                        mutableState.update { current ->
                            current.copy(
                                messages = current.messages.map { if (it.id == boxId) it.copy(process = poll.process) else it },
                            )
                        }
                        if (poll.process.terminal) {
                            mutableState.update { it.copy(pending = null) }
                            // Criar, editar e vincular mudam a agenda; uma consulta pura ou uma resposta, não.
                            if (poll.process.entities.isNotEmpty()) mutableEffects.tryEmit(AgentChatUiEffect.EntitiesChanged)
                            return
                        }
                    }

                    is ProcessPoll.Failed -> {
                        failures += 1
                        if (poll.status == 401) return handleError(id, "session_expired")
                        if (failures >= PROCESS_POLL_FAILURES) return handleError(id, "connection_lost")
                    }
                }
                if (waited >= PROCESS_TIMEOUT_MILLIS) return handleError(id, "connection_lost")
                delay(processPollMillis)
                waited += processPollMillis
            }
        }

        fun retry(messageId: String) {
            val error = mutableState.value.messages.firstOrNull { it.id == messageId } ?: return
            if (error.role != AgentChatMessageRole.Error || mutableState.value.pending != null) return
            mutableState.update { current ->
                current.copy(messages = current.messages.filterNot { it.id == messageId || it.id == error.requestId })
            }
            send(error.retryText)
        }

        /** Começar de novo é estado local: limpa a tela. */
        fun startNewConversation() {
            if (mutableState.value.pending != null) return
            mutableState.update { AgentChatUiState() }
        }

        private fun handleError(
            id: String,
            code: String,
        ) {
            val current = mutableState.value
            if (current.pending?.id != id) return
            val request = current.messages.firstOrNull { it.id == id && it.role == AgentChatMessageRole.User }
            mutableState.value =
                current.copy(
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
            const val PROCESS_LABEL = "Realizando processos"
            const val PROCESS_POLL_MILLIS = 1_000L
            const val PROCESS_TIMEOUT_MILLIS = 180_000L
            const val PROCESS_POLL_FAILURES = 5

            fun errorText(code: String): String =
                when (code) {
                    "connection_lost" -> "A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar."
                    "connection_failed" -> "Não consegui conectar ao assistente. Tente de novo."
                    "session_expired" -> "Sua sessão acabou. Entre de novo para continuar."
                    else -> "Algo deu errado. Tente de novo."
                }
        }
    }
