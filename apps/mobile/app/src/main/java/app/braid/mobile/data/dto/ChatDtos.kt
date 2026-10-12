@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package app.braid.mobile.data.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** DTOs espelham `packages/contracts/src/agent/contracts` e `agent-chat/contracts`. */
@Serializable
data class AgentChatTicketRequestDto(
    val userId: String,
)

@Serializable
data class AgentChatTicketDto(
    val ticket: String,
    val expiresAt: String,
)

@Serializable
data class AgentChatEntityRefDto(
    val kind: String,
    val id: String,
    val change: String,
    val label: String? = null,
)

@Serializable
data class AgentScreenContextDto(
    val screen: String,
    val entityId: String? = null,
)

@Serializable
@kotlinx.serialization.json.JsonClassDiscriminator("type")
sealed interface AgentChatClientFrameDto

@Serializable
@SerialName("message")
data class AgentChatMessageFrameDto(
    val id: String,
    val text: String,
    val context: AgentScreenContextDto? = null,
    val conversationId: String? = null,
) : AgentChatClientFrameDto

@Serializable
@SerialName("cancel")
data class AgentChatCancelFrameDto(
    val id: String,
) : AgentChatClientFrameDto

@Serializable
@kotlinx.serialization.json.JsonClassDiscriminator("type")
sealed interface AgentChatServerFrameDto

@Serializable
@SerialName("ready")
data class AgentChatReadyFrameDto(
    val userId: String,
    val expiresAt: String,
) : AgentChatServerFrameDto

@Serializable
@SerialName("status")
data class AgentChatStatusFrameDto(
    val id: String,
    val label: String,
) : AgentChatServerFrameDto

@Serializable
@SerialName("reply")
data class AgentChatReplyFrameDto(
    val id: String,
    val conversationId: String,
    val assistantSeq: Int,
    val agentResponse: String,
    val entities: List<AgentChatEntityRefDto>,
    val createdEntities: List<JsonObject>,
    val updatedEntities: List<JsonObject>,
    val deletedEntities: List<JsonObject>,
) : AgentChatServerFrameDto

@Serializable
@SerialName("error")
data class AgentChatErrorFrameDto(
    val id: String? = null,
    val code: String,
) : AgentChatServerFrameDto

@Serializable
data class AgentConversationDto(
    val id: String,
    val title: String? = null,
    val preview: String,
    val lastMessageAt: String,
    val revision: Int,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class AgentConversationPageDto(
    val items: List<AgentConversationDto>,
    val nextCursor: String? = null,
)

@Serializable
data class AgentChatMessageDto(
    val id: String,
    val seq: Int,
    val role: String,
    val content: String,
    val entities: List<AgentChatEntityRefDto>,
    val createdAt: String,
)

@Serializable
data class AgentChatMessagePageDto(
    val items: List<AgentChatMessageDto>,
    val nextCursor: String? = null,
)
