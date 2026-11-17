package app.braid.mobile.data.chat

import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.requests.ScreenContextDto
import app.braid.mobile.data.requests.StartHermesBody
import app.braid.mobile.data.requests.StartRequestBody
import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.domain.chat.ChatFailureCode
import app.braid.mobile.domain.chat.ChatRepository
import app.braid.mobile.domain.chat.ChatRequestException
import app.braid.mobile.domain.chat.HermesOffException
import app.braid.mobile.domain.request.AgentRequest
import kotlinx.coroutines.CancellationException
import retrofit2.HttpException
import javax.inject.Inject

/** Onde o chat está: a Agenda (o agente decide se isso importa para o pedido). */
private val AgendaContext = ScreenContextDto("agenda")

/** O chat sobre as mesmas rotas de pedido que o detalhe da tarefa de agente usa, com os erros traduzidos para a conversa. */
class DefaultChatRepository
    @Inject
    constructor(
        private val api: RequestsApi,
    ) : ChatRepository {
        override suspend fun start(
            userId: String,
            text: String,
            sessionId: String?,
            clientMessageId: String,
        ): String = call { api.start(StartRequestBody(userId, text, sessionId, clientMessageId, AgendaContext)).requestId }

        override suspend fun sendHermes(
            userId: String,
            text: String,
            sessionId: String?,
            clientMessageId: String,
        ): AgentRequest =
            try {
                call { api.startHermes(StartHermesBody(userId, text, sessionId, clientMessageId)).toDomain() }
            } catch (failure: ChatRequestException) {
                // Desligado, a API responde 404 antes de ler o corpo.
                if ((failure.cause as? HttpException)?.code() == HTTP_NOT_FOUND) throw HermesOffException(failure.cause)
                throw failure
            }

        override suspend fun request(id: String): AgentRequest = call { api.request(id).toDomain() }

        override suspend fun recent(): List<AgentRequest> = call { api.recent().map { it.toDomain() } }

        override suspend fun cancel(id: String): AgentRequest = call { api.cancel(id).toDomain() }

        /** Traduz o que a rede devolve no código que a conversa mostra (`startFailureCode` do web). */
        private suspend fun <T> call(block: suspend () -> T): T =
            try {
                block()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: HttpException) {
                throw ChatRequestException(codeOf(failure.code()), failure)
            } catch (failure: Exception) {
                throw ChatRequestException(ChatFailureCode.ConnectionFailed, failure)
            }

        private fun codeOf(status: Int): ChatFailureCode =
            when (status) {
                HTTP_UNAUTHORIZED -> ChatFailureCode.SessionExpired
                HTTP_BAD_REQUEST, HTTP_UNPROCESSABLE -> ChatFailureCode.InvalidInput
                HTTP_FORBIDDEN -> ChatFailureCode.Forbidden
                HTTP_CONFLICT -> ChatFailureCode.Conflict
                HTTP_BAD_GATEWAY, HTTP_UNAVAILABLE, HTTP_GATEWAY_TIMEOUT -> ChatFailureCode.Unavailable
                else -> ChatFailureCode.ConnectionFailed
            }

        private companion object {
            const val HTTP_BAD_REQUEST = 400
            const val HTTP_UNAUTHORIZED = 401
            const val HTTP_FORBIDDEN = 403
            const val HTTP_NOT_FOUND = 404
            const val HTTP_CONFLICT = 409
            const val HTTP_UNPROCESSABLE = 422
            const val HTTP_BAD_GATEWAY = 502
            const val HTTP_UNAVAILABLE = 503
            const val HTTP_GATEWAY_TIMEOUT = 504
        }
    }
