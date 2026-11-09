package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AgentScreenContextDto
import app.braid.mobile.data.dto.AiProcessDto
import app.braid.mobile.data.dto.StartAiProcessDto
import app.braid.mobile.data.session.SessionRepository
import kotlinx.serialization.SerializationException
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

sealed interface ProcessStart {
    data class Started(
        val processId: String,
    ) : ProcessStart

    data class Failed(
        val status: Int? = null,
    ) : ProcessStart
}

sealed interface ProcessPoll {
    data class View(
        val process: AiProcessDto,
    ) : ProcessPoll

    data class Failed(
        val status: Int? = null,
    ) : ProcessPoll
}

interface ProcessGateway {
    suspend fun start(
        text: String,
        context: AgentScreenContextDto?,
    ): ProcessStart

    suspend fun get(processId: String): ProcessPoll
}

@Singleton
class ProcessRepository
    @Inject
    constructor(
        private val api: ProcessApi,
        private val session: SessionRepository,
    ) : ProcessGateway {
        override suspend fun start(
            text: String,
            context: AgentScreenContextDto?,
        ): ProcessStart {
            val userId = session.snapshot()?.user?.userId ?: return ProcessStart.Failed(401)
            val response =
                try {
                    api.startProcess(StartAiProcessDto(userId, text, context))
                } catch (_: IOException) {
                    return ProcessStart.Failed()
                } catch (_: SerializationException) {
                    return ProcessStart.Failed()
                }
            if (!response.isSuccessful) return ProcessStart.Failed(response.code())
            return response.body()?.let { ProcessStart.Started(it.processId) } ?: ProcessStart.Failed(502)
        }

        override suspend fun get(processId: String): ProcessPoll {
            val response =
                try {
                    api.process(processId)
                } catch (_: IOException) {
                    return ProcessPoll.Failed()
                } catch (_: SerializationException) {
                    return ProcessPoll.Failed()
                }
            if (!response.isSuccessful) return ProcessPoll.Failed(response.code())
            return response.body()?.let { ProcessPoll.View(it) } ?: ProcessPoll.Failed(502)
        }
    }
