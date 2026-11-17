package app.braid.mobile.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class AiJobRequestDto(
    val text: String,
    val conversationId: String? = null,
    val clientMessageId: String? = null,
)

/** O resultado de um job: a voz traz `eventId` e `kind`; a nota de refeição, `noteId`; o Hermes, `text`. */
@Serializable
data class AiJobResultDto(
    val eventId: String? = null,
    val kind: String? = null,
    val noteId: String? = null,
    val skipped: Boolean? = null,
    val text: String? = null,
)

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
