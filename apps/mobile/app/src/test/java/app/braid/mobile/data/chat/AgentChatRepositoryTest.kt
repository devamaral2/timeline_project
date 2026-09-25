package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AgentChatMessageFrameDto
import app.braid.mobile.data.dto.AgentChatMessagePageDto
import app.braid.mobile.data.dto.AgentChatTicketDto
import app.braid.mobile.data.dto.AgentChatTicketRequestDto
import app.braid.mobile.data.dto.AgentConversationPageDto
import app.braid.mobile.data.session.SessionRepository
import app.braid.mobile.data.session.SessionSnapshot
import app.braid.mobile.data.session.SessionUser
import app.braid.mobile.data.session.TokenStore
import app.cash.turbine.test
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AgentChatRepositoryTest {
    @Test
    fun rejectedTicketGetsOneFreshTicketAndSendsAfterReady() =
        runTest {
            val requests = mutableListOf<AgentChatTicketRequestDto>()
            val api =
                FakeChatApi { request ->
                    requests += request
                    Response.success(AgentChatTicketDto("ticket-${requests.size}", "2026-09-24T12:00:00Z"))
                }
            val factory = FakeSocketFactory()
            val repository = repository(api, factory)

            val sending = launch { repository.send(message("m1")) }
            runCurrent()
            factory.sockets.single().serverCloses(4401, "unauthorized")
            runCurrent()

            assertEquals(2, factory.sockets.size)
            factory.sockets[1].serverSends(ready())
            sending.join()

            assertEquals(listOf("user-1", "user-1"), requests.map { it.userId })
            assertEquals(1, factory.sockets[1].sent.size)
        }

    @Test
    fun readyTimeoutMapsToConnectionFailed() =
        runTest {
            val api = FakeChatApi { Response.success(ticket()) }
            val factory = FakeSocketFactory()
            val repository = repository(api, factory)

            repository.events.test {
                val sending = launch { repository.send(message("m1")) }
                advanceUntilIdle()
                sending.join()
                assertEquals(AgentChatEvent.Error("m1", "connection_failed"), awaitItem())
                assertEquals(SOCKET_CLOSED, factory.sockets.single().readyState)
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun lifecycleCloseReopensSilentlyOnNextMessage() =
        runTest {
            val api = FakeChatApi { Response.success(ticket()) }
            val factory = FakeSocketFactory()
            val repository = repository(api, factory)

            val first = launch { repository.send(message("m1")) }
            runCurrent()
            factory.sockets[0].serverSends(ready())
            first.join()
            factory.sockets[0].serverSends(
                """{"type":"reply","id":"m1","conversationId":"c1","assistantSeq":1,"agentResponse":"ok","entities":[],"createdEntities":[],"updatedEntities":[],"deletedEntities":[]}""",
            )
            factory.sockets[0].serverCloses(4001, "reauthenticate")

            val second = launch { repository.send(message("m2")) }
            runCurrent()
            assertEquals(2, factory.sockets.size)
            factory.sockets[1].serverSends(ready())
            second.join()

            assertTrue(
                factory.sockets[1]
                    .sent
                    .single()
                    .contains("m2"),
            )
            assertEquals(2, api.calls)
        }

    private fun repository(
        api: ChatApi,
        factory: FakeSocketFactory,
    ): AgentChatRepository =
        AgentChatRepository(
            api = api,
            socketFactory = factory,
            json =
                Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                },
            sessionRepository = sessionRepository(),
        )

    private fun sessionRepository(): SessionRepository =
        SessionRepository(
            object : TokenStore {
                private var snapshot: SessionSnapshot? =
                    SessionSnapshot(
                        accessToken = "access",
                        refreshToken = "refresh",
                        user = SessionUser("user-1", "user@example.com", "User", "session-1"),
                    )

                override suspend fun read(): SessionSnapshot? = snapshot

                override suspend fun write(snapshot: SessionSnapshot) {
                    this.snapshot = snapshot
                }

                override suspend fun clear() {
                    snapshot = null
                }
            },
        )

    private fun message(id: String) = AgentChatMessageFrameDto(id = id, text = "Oi")

    private fun ticket() = AgentChatTicketDto("ticket-1", "2026-09-24T12:00:00Z")

    private fun ready() = """{"type":"ready","userId":"user-1","expiresAt":"2026-09-24T12:00:00Z"}"""
}

private class FakeSocketFactory : ChatSocketFactory {
    val sockets = mutableListOf<FakeSocket>()

    override fun open(
        url: String,
        listener: ChatSocketListener,
    ): ChatSocket = FakeSocket(url, listener).also(sockets::add)
}

private class FakeChatApi(
    private val responder: suspend (AgentChatTicketRequestDto) -> Response<AgentChatTicketDto>,
) : ChatApi {
    var calls = 0
        private set

    override suspend fun issueTicket(request: AgentChatTicketRequestDto): Response<AgentChatTicketDto> {
        calls += 1
        return responder(request)
    }

    override suspend fun listConversations(
        cursor: String?,
        limit: Int?,
    ): Response<AgentConversationPageDto> = error("not used")

    override suspend fun listMessages(
        conversationId: String,
        cursor: String?,
        limit: Int?,
    ): Response<AgentChatMessagePageDto> = error("not used")

    override suspend fun deleteConversation(conversationId: String): Response<Unit> = error("not used")
}

private class FakeSocket(
    val url: String,
    private val listener: ChatSocketListener,
) : ChatSocket {
    override var readyState: Int = SOCKET_CONNECTING
    val sent = mutableListOf<String>()

    override fun send(data: String): Boolean {
        sent += data
        return readyState == SOCKET_OPEN
    }

    override fun close(
        code: Int,
        reason: String,
    ) {
        readyState = SOCKET_CLOSED
    }

    fun serverSends(data: String) {
        readyState = SOCKET_OPEN
        listener.onMessage(data)
    }

    fun serverCloses(
        code: Int,
        reason: String,
    ) {
        readyState = SOCKET_CLOSED
        listener.onClosed(code, reason)
    }
}
