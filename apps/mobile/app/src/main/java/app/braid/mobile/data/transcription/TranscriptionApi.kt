package app.braid.mobile.data.transcription

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

@Serializable
data class TranscriptionBody(
    val url: String,
)

@Serializable
data class TranscriptionResultDto(
    val requestId: String,
    val taskId: String,
    val artifactId: String,
    val created: Boolean,
)

interface TranscriptionApi {
    /** Responde 200 `{ requestId, taskId, artifactId, created }`; 400 quando o endereço não é de um vídeo do YouTube. */
    @POST("api/tasks/transcription-requests")
    suspend fun request(
        @Body body: TranscriptionBody,
    ): TranscriptionResultDto
}
