package app.braid.mobile.data.chat

import app.braid.mobile.data.http.HTTP_NOT_FOUND
import app.braid.mobile.data.http.translatingStartFailures
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.requests.ScreenContextDto
import app.braid.mobile.data.requests.StartHermesBody
import app.braid.mobile.data.requests.StartModelBody
import app.braid.mobile.data.requests.StartRequestBody
import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.data.requests.toDto
import app.braid.mobile.domain.chat.ChatRepository
import app.braid.mobile.domain.chat.ChatRequestException
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.HermesOffException
import app.braid.mobile.domain.request.ModelOffException
import app.braid.mobile.domain.request.ModelOptions
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.domain.request.RequestStarted
import retrofit2.HttpException
import javax.inject.Inject

/** Onde o chat está: a Agenda (o agente decide se isso importa para o pedido). */
private val AgendaContext = ScreenContextDto("agenda")

/** O chat sobre as mesmas rotas de pedido que o detalhe da tarefa de agente usa, com os erros traduzidos para a conversa. */
class DefaultChatRepository
    @Inject
    constructor(
        private val api: RequestsApi,
        private val started: RequestStarted = RequestStarted(),
    ) : ChatRepository {
        override suspend fun start(
            userId: String,
            text: String,
            sessionId: String?,
            clientMessageId: String,
            selection: ModelSelection?,
        ): String =
            call { api.start(StartRequestBody(userId, text, sessionId, clientMessageId, AgendaContext, selection?.toDto())).requestId }
                .also { started.notifyStarted() }

        override suspend fun sendHermes(
            userId: String,
            text: String,
            sessionId: String?,
            clientMessageId: String,
        ): AgentRequest =
            try {
                call { api.startHermes(StartHermesBody(userId, text, sessionId, clientMessageId)).toDomain() }.also { started.notifyStarted() }
            } catch (failure: ChatRequestException) {
                // Desligado, a API responde 404 antes de ler o corpo.
                if ((failure.cause as? HttpException)?.code() == HTTP_NOT_FOUND) throw HermesOffException(failure.cause)
                throw failure
            }

        override suspend fun sendModel(
            userId: String,
            text: String,
            sessionId: String?,
            clientMessageId: String,
            selection: ModelSelection,
        ): AgentRequest =
            offWhenMissing {
                call { api.startModel(StartModelBody(userId, text, sessionId, clientMessageId, selection.toDto())).toDomain() }
            }.also { started.notifyStarted() }

        override suspend fun modelOptions(): ModelOptions =
            offWhenMissing {
                // Uma resposta sem padrão legível é a de um servidor que este app não entende: o modo não liga.
                call { api.modelOptions().toDomain() } ?: throw ModelOffException()
            }

        /** Sem nenhum provedor com chave a API responde 404 antes de ler o corpo; o chat o trata como modo desligado. */
        private suspend fun <T> offWhenMissing(block: suspend () -> T): T =
            try {
                block()
            } catch (failure: ChatRequestException) {
                if ((failure.cause as? HttpException)?.code() == HTTP_NOT_FOUND) throw ModelOffException(failure.cause)
                throw failure
            }

        override suspend fun request(id: String): AgentRequest = call { api.request(id).toDomain() }

        override suspend fun recent(): List<AgentRequest> = call { api.recent().map { it.toDomain() } }

        override suspend fun cancel(id: String): AgentRequest = call { api.cancel(id).toDomain() }

        private suspend fun <T> call(block: suspend () -> T): T = translatingStartFailures(block)
    }
