package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AgentChatMessagePageDto
import app.braid.mobile.data.dto.AgentChatTicketDto
import app.braid.mobile.data.dto.AgentChatTicketRequestDto
import app.braid.mobile.data.dto.AgentConversationPageDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ChatApi {
    @POST("api/ai/chat/tickets")
    suspend fun issueTicket(
        @Body request: AgentChatTicketRequestDto,
    ): Response<AgentChatTicketDto>

    @GET("api/ai/conversations")
    suspend fun listConversations(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<AgentConversationPageDto>

    @GET("api/ai/conversations/{conversationId}/messages")
    suspend fun listMessages(
        @Path("conversationId") conversationId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<AgentChatMessagePageDto>

    @DELETE("api/ai/conversations/{conversationId}")
    suspend fun deleteConversation(
        @Path("conversationId") conversationId: String,
    ): Response<Unit>
}
