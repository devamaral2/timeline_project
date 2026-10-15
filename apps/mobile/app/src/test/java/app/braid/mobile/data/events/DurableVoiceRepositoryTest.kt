package app.braid.mobile.data.events

import app.braid.mobile.data.chat.AiJobOutbox
import app.braid.mobile.data.chat.ChatApi
import app.braid.mobile.data.dto.AiJobDto
import app.braid.mobile.data.dto.AiJobRequestDto
import app.braid.mobile.data.dto.AiJobResultDto
import app.braid.mobile.data.session.SessionRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.Response
import java.io.IOException

class DurableVoiceRepositoryTest {
    @Test
    fun recoveredVoiceJobOnlyPollsAndPreservesProgressAcrossNetworkLoss() =
        runTest {
            val eventsApi = mockk<EventsApi>()
            val jobsApi = mockk<ChatApi>()
            val repository = DurableVoiceRepository(eventsApi, jobsApi, mockk<SessionRepository>(), mockk<AiJobOutbox>(relaxed = true))
            val job =
                AiJobDto(
                    "job-voice", "transcript-event", "running", "user-1", "2026-09-22T11:00:00Z", "2026-09-22T11:01:00Z",
                    progress = "Criando refeição",
                    request = AiJobRequestDto("Almocei arroz", clientMessageId = "stable-voice-id"),
                )
            coEvery { jobsApi.job("job-voice") } throws IOException("offline") andThen
                Response.success(job.copy(status = "succeeded", result = AiJobResultDto(eventId = "event-1", kind = "meal")))
            val progress = mutableListOf<String?>()
            val result = repository.resume(job, progress::add)
            assertEquals(listOf("Criando refeição", "Criando refeição"), progress)
            assertEquals("event-1", (result as EventResult.Success).value.eventId)
            coVerify(exactly = 0) { eventsApi.submitVoiceJob(any()) }
        }
}
