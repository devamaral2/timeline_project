package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AgentChatMessagePageDto
import app.braid.mobile.data.dto.AgentChatTicketDto
import app.braid.mobile.data.dto.AgentChatTicketRequestDto
import app.braid.mobile.data.dto.AgentConversationPageDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

class AgentChatHistoryRepositoryTest {
    @Test
    fun forwardsPaginationAndDeleteToConversationApi() =
        kotlinx.coroutines.runBlocking {
            val api = FakeChatHistoryApi()
            val repository = AgentChatHistoryRepository(api)

            val conversations = repository.conversations("cursor-1")
            val messages = repository.messages("conversation-1", "cursor-2")
            val deleted = repository.delete("conversation-1")

            assertTrue(conversations is AgentChatHistoryResult.Success)
            assertTrue(messages is AgentChatHistoryResult.Success)
            assertTrue(deleted is AgentChatHistoryResult.Success)
            assertEquals("cursor-1", api.conversationCursor)
            assertEquals("cursor-2", api.messageCursor)
            assertEquals("conversation-1", api.messageConversationId)
            assertEquals("conversation-1", api.deletedConversationId)
        }
}

private class FakeChatHistoryApi : ChatApi {
    var conversationCursor: String? = null
    var messageCursor: String? = null
    var messageConversationId: String? = null
    var deletedConversationId: String? = null

    override suspend fun issueTicket(request: AgentChatTicketRequestDto): Response<AgentChatTicketDto> = error("not used")

    override suspend fun listConversations(
        cursor: String?,
        limit: Int?,
    ): Response<AgentConversationPageDto> {
        conversationCursor = cursor
        return Response.success(AgentConversationPageDto(emptyList(), "next"))
    }

    override suspend fun listMessages(
        conversationId: String,
        cursor: String?,
        limit: Int?,
    ): Response<AgentChatMessagePageDto> {
        messageConversationId = conversationId
        messageCursor = cursor
        return Response.success(AgentChatMessagePageDto(emptyList(), "next"))
    }

    override suspend fun deleteConversation(conversationId: String): Response<Unit> {
        deletedConversationId = conversationId
        return Response.success(Unit)
    }
}
