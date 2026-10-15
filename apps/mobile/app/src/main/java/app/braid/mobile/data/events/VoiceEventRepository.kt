package app.braid.mobile.data.events

import app.braid.mobile.data.dto.VoiceEventInputDto
import app.braid.mobile.data.dto.VoiceEventResponseDto
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

interface VoiceEventGateway {
    suspend fun create(transcript: String): EventResult<VoiceEventResponseDto>

    suspend fun create(
        transcript: String,
        requestId: String,
        onProgress: (String?) -> Unit,
    ): EventResult<VoiceEventResponseDto> = create(transcript)

    suspend fun recover(): List<app.braid.mobile.data.dto.AiJobDto> = emptyList()

    suspend fun resume(
        job: app.braid.mobile.data.dto.AiJobDto,
        onProgress: (String?) -> Unit,
    ): EventResult<VoiceEventResponseDto> = create(job.request?.text.orEmpty())
}

@Singleton
class VoiceEventRepository
    @Inject
    constructor(
        private val api: EventsApi,
    ) : VoiceEventGateway {
        override suspend fun create(transcript: String): EventResult<VoiceEventResponseDto> {
            val response =
                try {
                    api.createFromVoice(VoiceEventInputDto(transcript))
                } catch (_: IOException) {
                    return EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
                }
            if (!response.isSuccessful) {
                return EventResult.Failure(EventRepositoryError(EventErrorKind.Http, response.code()))
            }
            val body = response.body() ?: return EventResult.Failure(EventRepositoryError(EventErrorKind.Protocol, 502))
            return EventResult.Success(body)
        }
    }
