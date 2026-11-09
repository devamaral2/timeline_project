package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AgentScreenContextDto
import app.braid.mobile.data.dto.AiProcessDto
import app.braid.mobile.data.dto.StartAiProcessResponseDto
import app.braid.mobile.data.session.SessionRepository
import app.braid.mobile.data.session.SessionSnapshot
import app.braid.mobile.data.session.SessionUser
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import java.io.IOException

class ProcessRepositoryTest {
    private val api = mockk<ProcessApi>()
    private val session = mockk<SessionRepository>()

    private fun repository(signedIn: Boolean = true): ProcessRepository {
        coEvery { session.snapshot() } returns
            if (signedIn) SessionSnapshot("access", "refresh", SessionUser("user-1", "a@b.com", "A", "session-1")) else null
        return ProcessRepository(api, session)
    }

    private fun <T> error(code: Int): Response<T> = Response.error(code, "".toResponseBody("application/json".toMediaType()))

    @Test
    fun startsTheProcessForTheSignedInUserWithTheScreenContext() =
        runBlocking {
            coEvery { api.startProcess(any()) } returns Response.success(StartAiProcessResponseDto("process-1"))

            val result = repository().start("Almocei arroz", AgentScreenContextDto(screen = "agenda"))

            assertEquals(ProcessStart.Started("process-1"), result)
            coVerify {
                api.startProcess(
                    match { it.userId == "user-1" && it.text == "Almocei arroz" && it.context?.screen == "agenda" },
                )
            }
        }

    @Test
    fun a404IsJustAFailureNowThatTheRouteIsAlwaysOn() =
        runBlocking {
            coEvery { api.startProcess(any()) } returns error(404)
            assertEquals(ProcessStart.Failed(404), repository().start("oi", null))
        }

    @Test
    fun otherStatusesAndNetworkErrorsAreFailures() =
        runBlocking {
            coEvery { api.startProcess(any()) } returns error(500)
            assertEquals(ProcessStart.Failed(500), repository().start("oi", null))
            coEvery { api.startProcess(any()) } throws IOException("offline")
            assertEquals(ProcessStart.Failed(null), repository().start("oi", null))
        }

    @Test
    fun withoutASessionNothingIsSent() =
        runBlocking {
            assertEquals(ProcessStart.Failed(401), repository(signedIn = false).start("oi", null))
            coVerify(exactly = 0) { api.startProcess(any()) }
        }

    @Test
    fun pollsTheProcessAndReportsFailures() =
        runBlocking {
            val view = AiProcessDto("process-1", "running", "Realizando processos:")
            coEvery { api.process("process-1") } returns Response.success(view)
            assertEquals(ProcessPoll.View(view), repository().get("process-1"))
            coEvery { api.process("process-1") } returns error(401)
            assertEquals(ProcessPoll.Failed(401), repository().get("process-1"))
            coEvery { api.process("process-1") } throws IOException("offline")
            assertTrue(repository().get("process-1") is ProcessPoll.Failed)
        }
}
