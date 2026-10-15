package app.braid.mobile.data.events

import app.braid.mobile.data.chat.AiJobOutbox
import app.braid.mobile.data.chat.ChatApi
import app.braid.mobile.data.dto.AiJobDto
import app.braid.mobile.data.dto.SubmitVoiceJobDto
import app.braid.mobile.data.dto.VoiceEventResponseDto
import app.braid.mobile.data.session.SessionRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.serialization.SerializationException
import java.io.IOException
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DurableVoiceRepository
    @Inject
    constructor(
        private val eventsApi: EventsApi,
        private val jobsApi: ChatApi,
        private val session: SessionRepository,
        private val outbox: AiJobOutbox,
    ) : VoiceEventGateway {
        override suspend fun recover(): List<AiJobDto> {
            while (true) {
                try {
                    val response = jobsApi.listJobs()
                    if (!response.isSuccessful) throw IOException("Job recovery unavailable")
                    val userId = session.snapshot()?.user?.userId ?: throw IOException("session_expired")
                    val receipts = outbox.voices(userId)
                    val jobs = response.body().orEmpty().filter {
                        it.kind == "transcript-event" &&
                            (it.pending || receipts.any { receipt -> receipt.requestId == it.request?.clientMessageId })
                    }.toMutableList()
                    for (request in receipts) {
                        val known = jobs.any { it.request?.clientMessageId == request.requestId }
                        if (!known) {
                            val submitted = eventsApi.submitVoiceJob(request)
                            if (submitted.code() in 400..499 && submitted.code() !in listOf(401, 429)) {
                                outbox.forget("voice", userId, request.requestId)
                                continue
                            }
                            if (!submitted.isSuccessful) throw IOException("Outbox submission unavailable")
                            jobs.add(submitted.body() ?: throw IOException("Empty job response"))
                        }
                    }
                    return jobs
                } catch (_: SerializationException) {
                    delay(2_000)
                } catch (_: IOException) {
                    delay(2_000)
                }
            }
        }

        override suspend fun create(transcript: String): EventResult<VoiceEventResponseDto> =
            create(transcript, UUID.randomUUID().toString()) {}

        override suspend fun create(
            transcript: String,
            requestId: String,
            onProgress: (String?) -> Unit,
        ): EventResult<VoiceEventResponseDto> {
            val userId = session.snapshot()?.user?.userId
                ?: return EventResult.Failure(EventRepositoryError(EventErrorKind.Http, 401))
            val request = SubmitVoiceJobDto(transcript, requestId)
            outbox.remember(userId, request)
            while (true) {
                try {
                    val response = eventsApi.submitVoiceJob(request)
                    if (response.code() >= 500 || response.code() in listOf(401, 429)) throw IOException("Submit outcome unknown")
                    if (!response.isSuccessful) {
                        outbox.forget("voice", userId, requestId)
                        return EventResult.Failure(EventRepositoryError(EventErrorKind.Http, response.code()))
                    }
                    val job = response.body() ?: throw IOException("Empty job response")
                    return resume(job.copy(request = app.braid.mobile.data.dto.AiJobRequestDto(
                        transcript, clientMessageId = requestId,
                    )), onProgress)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: SerializationException) {
                    delay(2_000)
                } catch (_: IOException) {
                    onProgress("Reconectando; pedido preservado")
                    delay(2_000)
                }
            }
        }

        override suspend fun resume(
            job: AiJobDto,
            onProgress: (String?) -> Unit,
        ): EventResult<VoiceEventResponseDto> {
            var current = job
            while (current.pending) {
                onProgress(current.progress ?: "Na fila")
                delay(2_000)
                try {
                    val response = jobsApi.job(current.id)
                    if (response.isSuccessful) response.body()?.let { current = it }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: SerializationException) {
                    // Preserve the accepted job on protocol errors too.
                } catch (_: IOException) {
                    // An accepted job is only polled, never submitted again.
                }
            }
            val result = current.result
            job.request?.clientMessageId?.let { outbox.forget("voice", job.userId, it) }
            return if (current.status == "succeeded" && result?.eventId != null && result.kind != null) {
                EventResult.Success(VoiceEventResponseDto(result.eventId, result.kind))
            } else {
                EventResult.Failure(EventRepositoryError(EventErrorKind.Unavailable))
            }
        }
    }
