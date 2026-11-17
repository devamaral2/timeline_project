package app.braid.mobile.domain.chat

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

/** O Hermes está desligado nesta API (`AI_AUTOMATION`): a rota dele responde não encontrado. */
class HermesOffException(
    cause: Throwable? = null,
) : Exception("O Hermes está desligado nesta API.", cause)

/** Cancelar um pedido de alimento responde conflito: o alimento se apaga pelo próprio documento. */
class FoodCancelException(
    cause: Throwable? = null,
) : Exception("Este pedido calcula um alimento: apague o alimento para parar o cálculo.", cause)

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
    ): ChatRequest

    suspend fun request(id: String): ChatRequest

    /** Os pedidos do usuário, do mais novo para o mais antigo, sem o rastro. */
    suspend fun recent(): List<ChatRequest>

    suspend fun cancel(id: String): ChatRequest
}
