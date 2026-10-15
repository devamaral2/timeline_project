package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AgentChatMessageFrameDto
import app.braid.mobile.data.dto.AiJobDto
import app.braid.mobile.data.dto.AiJobRequestDto
import app.braid.mobile.data.dto.AiJobResultDto
import app.braid.mobile.data.dto.SubmitAiJobDto
import app.braid.mobile.data.session.SessionRepository
import app.braid.mobile.data.session.SessionSnapshot
import app.braid.mobile.data.session.SessionUser
import app.cash.turbine.test
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.Response
import java.io.IOException

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class DurableChatRepositoryTest {
    private val api = mockk<ChatApi>()
    private val session = mockk<SessionRepository>()
    private val outbox = mockk<AiJobOutbox>(relaxed = true)

    private fun repository(): DurableChatRepository {
        coEvery { session.snapshot() } returns SessionSnapshot("access", "refresh", SessionUser("user-1", "a@b.com", "A", "session-1"))
        coEvery { outbox.chats("user-1") } returns emptyList()
        return DurableChatRepository(api, session, outbox)
    }

    @Test
    fun acceptedJobOnlyPollsThroughNetworkLossAndCloseDoesNotCancel() =
        runTest {
            val repository = repository()
            coEvery { api.submitJob(any()) } returns Response.success(job())
            coEvery { api.job("job-1") } throws IOException("offline") andThen Response.success(completed())
            repository.events.test {
                val sending = launch { repository.send(AgentChatMessageFrameDto("request-1", "Oi")) }
                runCurrent()
                repository.close()
                advanceUntilIdle()
                sending.join()
                assertEquals("Consultando", (awaitItem() as AgentChatEvent.Status).frame.label)
                assertEquals("Consultando", (awaitItem() as AgentChatEvent.Status).frame.label)
                assertEquals("Pronto.", (awaitItem() as AgentChatEvent.Reply).frame.agentResponse)
                coVerify(exactly = 1) { api.submitJob(any()) }
                coVerify(exactly = 0) { api.cancelJob(any()) }
            }
        }

    @Test
    fun uncertainSubmitReusesThePersistedRequestId() =
        runTest {
            val repository = repository()
            coEvery { api.submitJob(any()) } throws IOException("response lost") andThen Response.success(completed())
            repository.send(AgentChatMessageFrameDto("stable-id", "Oi"))
            coVerify(exactly = 2) { api.submitJob(match { it.clientMessageId == "stable-id" }) }
            coVerify(exactly = 1) { outbox.remember(match<SubmitAiJobDto> { it.clientMessageId == "stable-id" }) }
        }

    @Test
    fun restartReconcilesAcceptedOutboxWithoutResubmitting() =
        runTest {
            val repository = repository()
            coEvery { outbox.chats("user-1") } returns listOf(SubmitAiJobDto("user-1", "Oi", "request-1"))
            coEvery { api.listJobs() } returns Response.success(listOf(job()))
            assertEquals(listOf(job()), repository.recover())
            coVerify(exactly = 0) { api.submitJob(any()) }
            coVerify(exactly = 0) { outbox.forget("chat", "user-1", "request-1") }
        }

    @Test
    fun terminalHistoryIsOnlyRecoveredWithAnUnobservedReceipt() =
        runTest {
            val repository = repository()
            coEvery { api.listJobs() } returns Response.success(listOf(completed()))
            assertEquals(emptyList<AiJobDto>(), repository.recover())
            coEvery { outbox.chats("user-1") } returns listOf(SubmitAiJobDto("user-1", "Oi", "request-1"))
            assertEquals(listOf(completed()), repository.recover())
            repository.resume(completed())
            coVerify(exactly = 1) { outbox.forget("chat", "user-1", "request-1") }
        }

    @Test
    fun explicitCancelUsesTheServerJobId() =
        runTest {
            val repository = repository()
            coEvery { api.cancelJob("job-1") } returns Response.success(job().copy(status = "cancelled"))
            repository.cancel("request-1")
            repository.resume(job())
            coVerify(exactly = 1) { api.cancelJob("job-1") }
            coVerify(exactly = 0) { api.job(any()) }
        }

    private fun job() =
        AiJobDto(
            "job-1",
            "agent-turn",
            "running",
            "user-1",
            "2026-09-22T11:00:00Z",
            "2026-09-22T11:01:00Z",
            progress = "Consultando",
            request = AiJobRequestDto("Oi", clientMessageId = "request-1"),
        )

    private fun completed() = job().copy(status = "succeeded", result = AiJobResultDto("Pronto.", "conversation-1", 2))
}
