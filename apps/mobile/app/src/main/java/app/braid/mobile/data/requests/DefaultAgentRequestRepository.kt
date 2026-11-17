package app.braid.mobile.data.requests

import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentRequestRepository
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.FoodRequestCancelException
import app.braid.mobile.domain.request.RequestNotFoundException
import retrofit2.HttpException
import javax.inject.Inject

class DefaultAgentRequestRepository
    @Inject
    constructor(
        private val api: RequestsApi,
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
            sessionId: String,
            clientMessageId: String,
        ): String = api.start(StartRequestBody(userId, text, sessionId, clientMessageId)).requestId

        override suspend fun startEdit(
            userId: String,
            text: String,
            entityType: EditEntityType,
            entityId: String,
        ): String = api.startEdit(StartEditBody(userId, text, entityType.code, entityId)).requestId

        override suspend fun cancel(id: String): AgentRequest =
            try {
                api.cancel(id).toDomain()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_CONFLICT) throw FoodRequestCancelException(failure)
                throw failure
            }

        private companion object {
            const val HTTP_FORBIDDEN = 403
            const val HTTP_NOT_FOUND = 404
            const val HTTP_CONFLICT = 409
        }
    }
