package app.braid.mobile.data.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Serializable
data class AiJobRequestDto(
    val text: String,
    val conversationId: String? = null,
    val clientMessageId: String? = null,
)

@Serializable
data class SubmitAiJobDto(
    val userId: String,
    val text: String,
    val clientMessageId: String,
    val context: AgentScreenContextDto? = null,
    val conversationId: String? = null,
)

@Serializable
data class AiJobResultDto(
    val agentResponse: String? = null,
    val conversationId: String? = null,
    val assistantSeq: Int? = null,
    val entities: List<AgentChatEntityRefDto> = emptyList(),
    val createdEntities: List<JsonObject> = emptyList(),
    val updatedEntities: List<JsonObject> = emptyList(),
    val deletedEntities: List<JsonObject> = emptyList(),
    val eventId: String? = null,
    val kind: String? = null,
    val noteId: String? = null,
    val skipped: Boolean? = null,
) {
    val entityRefs: List<AgentChatEntityRefDto>
        get() =
            entities.ifEmpty {
                listOf("created" to createdEntities, "updated" to updatedEntities, "deleted" to deletedEntities)
                    .flatMap { (change, items) ->
                        items.mapNotNull { item ->
                            val kind = (item["kind"] as? JsonPrimitive)?.content
                            val id = (item["id"] as? JsonPrimitive)?.content
                            if (kind == null || id == null) {
                                null
                            } else {
                                AgentChatEntityRefDto(kind, id, change, (item["name"] as? JsonPrimitive)?.content)
                            }
                        }
                    }
            }
}

@Serializable
data class AiJobDto(
    val id: String,
    val kind: String,
    val status: String,
    val userId: String,
    val createdAt: String,
    val updatedAt: String,
    val progress: String? = null,
    val errorCode: String? = null,
    val request: AiJobRequestDto? = null,
    val result: AiJobResultDto? = null,
) {
    val pending: Boolean get() = status == "queued" || status == "running"
}

@Serializable
data class SubmitVoiceJobDto(
    val transcript: String,
    val requestId: String,
)
