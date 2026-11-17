package app.braid.mobile.domain.chat

import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.HermesOffException

/** Por que um pedido falhou ou não chegou; cada código tem o seu texto em [chatFailureText]. */
enum class ChatFailureCode(
    val code: String,
) {
    InvalidInput("invalid_input"),
    Forbidden("forbidden"),
    LimitReached("limit_reached"),
    Conflict("conflict"),
    Unavailable("unavailable"),
    Cancelled("cancelled"),
    Internal("internal"),
    ConnectionLost("connection_lost"),
    ConnectionFailed("connection_failed"),
    SessionExpired("session_expired"),
    ;

    /**
     * Falhas de rede ou de sessão: reenviar a mesma mensagem (mesmo id) não abre um segundo pedido, porque a API devolve o
     * que já aceitou. As demais são do pedido; "Tentar de novo" abre um pedido novo.
     */
    val resumable: Boolean get() = this == ConnectionFailed || this == ConnectionLost || this == SessionExpired

    companion object {
        fun fromCode(code: String?): ChatFailureCode = entries.firstOrNull { it.code == code } ?: Internal
    }
}

/** Uma chamada ao pedido que falhou, já traduzida no código que a conversa mostra. */
class ChatRequestException(
    val failure: ChatFailureCode,
    cause: Throwable? = null,
) : Exception("Pedido ao assistente falhou: ${failure.code}", cause)

interface ChatRepository {
    /** Abre o pedido em texto e devolve o id. O [clientMessageId] estável faz o reenvio devolver o mesmo pedido. */
    suspend fun start(
        userId: String,
        text: String,
        sessionId: String?,
        clientMessageId: String,
    ): String

    /** Manda a mensagem ao Hermes e devolve o pedido inteiro. Desligado, sobe [HermesOffException]. */
    suspend fun sendHermes(
        userId: String,
        text: String,
        sessionId: String?,
        clientMessageId: String,
    ): AgentRequest

    suspend fun request(id: String): AgentRequest

    /** Os pedidos do usuário, do mais novo para o mais antigo, sem o rastro. */
    suspend fun recent(): List<AgentRequest>

    suspend fun cancel(id: String): AgentRequest
}
