package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AgentChatMessagePageDto
import app.braid.mobile.data.dto.AgentConversationPageDto
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

sealed interface AgentChatHistoryResult<out T> {
    data class Success<T>(
        val value: T,
    ) : AgentChatHistoryResult<T>

    data class Failure(
        val status: Int? = null,
    ) : AgentChatHistoryResult<Nothing>
}

interface AgentChatHistoryGateway {
    suspend fun conversations(cursor: String? = null): AgentChatHistoryResult<AgentConversationPageDto>

    suspend fun messages(
        conversationId: String,
        cursor: String? = null,
    ): AgentChatHistoryResult<AgentChatMessagePageDto>

    suspend fun delete(conversationId: String): AgentChatHistoryResult<Unit>
}

@Singleton
class AgentChatHistoryRepository
    @Inject
    constructor(
        private val api: ChatApi,
    ) : AgentChatHistoryGateway {
        override suspend fun conversations(cursor: String?): AgentChatHistoryResult<AgentConversationPageDto> =
            call { api.listConversations(cursor) }

        override suspend fun messages(
            conversationId: String,
            cursor: String?,
        ): AgentChatHistoryResult<AgentChatMessagePageDto> = call { api.listMessages(conversationId, cursor) }

        override suspend fun delete(conversationId: String): AgentChatHistoryResult<Unit> {
            val response =
                try {
                    api.deleteConversation(conversationId)
                } catch (_: IOException) {
                    return AgentChatHistoryResult.Failure()
                }
            return if (response.isSuccessful) {
                AgentChatHistoryResult.Success(Unit)
            } else {
                AgentChatHistoryResult.Failure(response.code())
            }
        }

        private suspend fun <T> call(request: suspend () -> retrofit2.Response<T>): AgentChatHistoryResult<T> {
            val response =
                try {
                    request()
                } catch (_: IOException) {
                    return AgentChatHistoryResult.Failure()
                }
            if (!response.isSuccessful) return AgentChatHistoryResult.Failure(response.code())
            return response.body()?.let { AgentChatHistoryResult.Success(it) }
                ?: AgentChatHistoryResult.Failure(502)
        }
    }
