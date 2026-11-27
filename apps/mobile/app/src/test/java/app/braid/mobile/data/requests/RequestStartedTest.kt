package app.braid.mobile.data.requests

import app.braid.mobile.data.chat.DefaultChatRepository
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.RequestStarted
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.cash.turbine.test
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** O app avisa a gaveta de execução logo depois de abrir um pedido, de qualquer lugar, e só se o servidor o aceitou. */
class RequestStartedTest {
    private lateinit var backend: TestBackend
    private val started = RequestStarted()

    private lateinit var agentRequests: DefaultAgentRequestRepository
    private lateinit var chat: DefaultChatRepository

    @Before
    fun setUp() {
        backend = TestBackend()
        val api = TestGraph(backend).apis.create(RequestsApi::class.java)
        agentRequests = DefaultAgentRequestRepository(api, started)
        chat = DefaultChatRepository(api, started)
    }

    @After
    fun tearDown() = backend.close()

    @Test
    fun `a request opened from a task announces itself`() =
        runBlocking {
            backend.route("POST", "/api/requests", fixture("request-accepted", 202))
            started.signals.test {
                agentRequests.start("user-1", "resuma", null, "msg-1")
                awaitItem()
            }
        }

    @Test
    fun `an edit request announces itself`() =
        runBlocking {
            backend.route("POST", "/api/requests/edit", fixture("entity-edit-accepted", 202))
            started.signals.test {
                agentRequests.startEdit("user-1", "mude", EditEntityType.Task, "task-1", null)
                awaitItem()
            }
        }

    @Test
    fun `a chat message announces itself`() =
        runBlocking {
            backend.route("POST", "/api/requests", fixture("request-accepted", 202))
            backend.route("POST", "/api/requests/hermes", fixture("chat-hermes-accepted", 202))
            started.signals.test {
                chat.start("user-1", "oi", null, "msg-1", null)
                awaitItem()
                chat.sendHermes("user-1", "oi", null, "msg-2")
                awaitItem()
            }
        }

    @Test
    fun `a request the server refused announces nothing`() =
        runBlocking {
            backend.route("POST", "/api/requests", status(500))
            started.signals.test {
                try {
                    agentRequests.start("user-1", "resuma", null, "msg-1")
                    fail("the failure should rise")
                } catch (expected: Exception) {
                    // A falha sobe para a tela, como sempre.
                }
                expectNoEvents()
            }
        }
}
