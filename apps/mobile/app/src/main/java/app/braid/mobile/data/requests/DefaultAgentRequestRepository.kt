package app.braid.mobile.data.requests

import app.braid.mobile.data.http.HTTP_CONFLICT
import app.braid.mobile.data.http.HTTP_FORBIDDEN
import app.braid.mobile.data.http.HTTP_NOT_FOUND
import app.braid.mobile.data.http.translatingStartFailures
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentRequestRepository
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.FoodRequestCancelException
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.domain.request.RequestNotFoundException
import app.braid.mobile.domain.request.RequestStarted
import retrofit2.HttpException
import javax.inject.Inject

class DefaultAgentRequestRepository
    @Inject
    constructor(
        private val api: RequestsApi,
        private val started: RequestStarted = RequestStarted(),
    ) : AgentRequestRepository {
        override suspend fun request(id: String): AgentRequest =
            try {
                api.request(id).toDomain()
            } catch (failure: HttpException) {
                // O pedido de outro usuário responde 403 e o que não existe 404: a tela diz só que não há pedido.
                if (failure.code() == HTTP_NOT_FOUND || failure.code() == HTTP_FORBIDDEN) throw RequestNotFoundException(failure)
                throw failure
            }

        override suspend fun start(
            userId: String,
            text: String,
            sessionId: String?,
            clientMessageId: String,
        ): String = api.start(StartRequestBody(userId, text, sessionId, clientMessageId)).requestId.also { started.notifyStarted() }

        override suspend fun startEdit(
            userId: String,
            text: String,
            entityType: EditEntityType,
            entityId: String,
            selection: ModelSelection?,
        ): String =
            translatingStartFailures {
                api.startEdit(StartEditBody(userId, text, entityType.code, entityId, selection?.toDto())).requestId
            }.also { started.notifyStarted() }

        override suspend fun cancel(id: String): AgentRequest =
            try {
                api.cancel(id).toDomain()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_CONFLICT) throw FoodRequestCancelException(failure)
                throw failure
            }
    }
