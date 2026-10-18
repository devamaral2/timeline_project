package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AgentChatMessageFrameDto
import app.braid.mobile.data.dto.AgentChatReplyFrameDto
import app.braid.mobile.data.dto.AgentChatStatusFrameDto
import app.braid.mobile.data.dto.AiJobDto
import app.braid.mobile.data.dto.AiJobRequestDto
import app.braid.mobile.data.dto.SubmitAiJobDto
import app.braid.mobile.data.session.SessionRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.SerializationException
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/** Only observation belongs to the panel lifecycle. Server execution never does. */
@Singleton
class DurableChatRepository
    @Inject
    constructor(
        private val api: ChatApi,
        private val session: SessionRepository,
        private val outbox: AiJobOutbox,
    ) : AgentChatGateway {
        private val mutableEvents = MutableSharedFlow<AgentChatEvent>(extraBufferCapacity = 32)
        private val cancellations = mutableSetOf<String>()
        override val events = mutableEvents.asSharedFlow()

        override suspend fun recover(): List<AiJobDto> {
            while (true) {
                try {
                    val response = api.listJobs()
                    if (!response.isSuccessful) throw IOException("Job recovery unavailable")
                    val userId = session.snapshot()?.user?.userId ?: throw IOException("session_expired")
                    val receipts = outbox.chats(userId)
                    val jobs =
                        response
                            .body()
                            .orEmpty()
                            .filter {
                                it.kind == "agent-turn" &&
                                    (it.pending || receipts.any { receipt -> receipt.clientMessageId == it.request?.clientMessageId })
                            }.toMutableList()
                    for (request in receipts) {
                        val known = jobs.any { it.request?.clientMessageId == request.clientMessageId }
                        if (!known) {
                            val submitted = api.submitJob(request)
                            if (submitted.code() in 400..499 && submitted.code() !in listOf(401, 429)) {
                                outbox.forget("chat", userId, request.clientMessageId)
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

        override suspend fun send(message: AgentChatMessageFrameDto) {
            val userId = session.snapshot()?.user?.userId ?: throw IOException("session_expired")
            val request = SubmitAiJobDto(userId, message.text, message.id, message.context, message.conversationId)
            outbox.remember(request)
            // An uncertain submit is retried with the SAME id, never a new operation.
            while (true) {
                try {
                    val response =
                        api.submitJob(request)
                    if (response.code() >= 500 || response.code() in listOf(401, 429)) throw IOException("Submit outcome unknown")
                    if (!response.isSuccessful) {
                        outbox.forget("chat", userId, message.id)
                        val code =
                            when (response.code()) {
                                400 -> "invalid_input"
                                401 -> "session_expired"
                                403 -> "forbidden"
                                404 -> "conversation_gone"
                                409 -> "busy"
                                else -> "unavailable"
                            }
                        mutableEvents.emit(AgentChatEvent.Error(message.id, code))
                        return
                    }
                    val job = response.body() ?: throw IOException("Empty job response")
                    resume(job.copy(request = AiJobRequestDto(message.text, message.conversationId, message.id)))
                    return
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: SerializationException) {
                    delay(2_000)
                } catch (_: IOException) {
                    mutableEvents.emit(AgentChatEvent.Status(AgentChatStatusFrameDto(message.id, "Reconectando; pedido preservado")))
                    delay(2_000)
                }
            }
        }

        override suspend fun resume(job: AiJobDto) {
            val messageId = job.request?.clientMessageId ?: job.id
            var current = job
            while (current.pending) {
                mutableEvents.emit(
                    AgentChatEvent.Status(
                        AgentChatStatusFrameDto(
                            messageId,
                            current.progress ?: if (current.status == "queued") "Na fila" else "Preparando resposta",
                        ),
                    ),
                )
                delay(2_000)
                try {
                    val response = if (messageId in cancellations) api.cancelJob(current.id) else api.job(current.id)
                    if (response.isSuccessful) {
                        response.body()?.let { current = it }
                        cancellations.remove(messageId)
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: SerializationException) {
                    // An unreadable poll response must not turn an accepted job into a new operation.
                } catch (_: IOException) {
                    // Keep the last progress and accepted job. Network loss isn't job failure.
                }
            }
            cancellations.remove(messageId)
            val result = current.result
            if (current.status == "succeeded" && result?.agentResponse != null) {
                mutableEvents.emit(
                    AgentChatEvent.Reply(
                        AgentChatReplyFrameDto(
                            messageId,
                            result.conversationId ?: current.request?.conversationId.orEmpty(),
                            result.assistantSeq ?: 0,
                            result.agentResponse,
                            result.entityRefs,
                            result.createdEntities,
                            result.updatedEntities,
                            result.deletedEntities,
                        ),
                    ),
                )
            } else {
                mutableEvents.emit(AgentChatEvent.Error(messageId, current.errorCode ?: current.status))
            }
            outbox.forget("chat", job.userId, messageId)
        }

        override fun cancel(id: String) {
            cancellations.add(id)
        }

        override fun close() = Unit
    }
