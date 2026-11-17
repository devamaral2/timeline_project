package app.braid.mobile.data.session

import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.session.SessionUser
import app.braid.mobile.support.InMemorySessionStorage
import app.braid.mobile.support.ProbeApi
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException
import java.util.concurrent.atomic.AtomicInteger

class SessionTest {
    private lateinit var backend: TestBackend
    private val user = SessionUser(userId = "user-1", name = "Admin", email = "admin@admin.com")
    private val stored =
        StoredSession(
            accessToken = "access-velho",
            refreshToken = "refresh-token-opaco",
            userId = "user-1",
            email = "admin@admin.com",
            name = "Admin",
        )
    private val refreshedAccess = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJyIjoxfQ.assinatura"

    @Before
    fun setUp() {
        backend = TestBackend()
    }

    @After
    fun tearDown() = backend.close()

    private fun signedInGraph() = TestGraph(backend, InMemorySessionStorage(stored))

    private fun probeThatAcceptsOnlyTheRefreshedToken() =
        backend.route("GET", "/api/probe") { request ->
            if (request.getHeader("Authorization") == "Bearer $refreshedAccess") {
                MockResponse().setHeader("Content-Type", "application/json").setBody("""{"ok":true}""")
            } else {
                MockResponse().setResponseCode(401).setBody("{}")
            }
        }

    @Test
    fun `reopening the app restores the session without touching the network`() =
        runBlocking {
            val graph = signedInGraph()

            graph.sessionRepository.restore()

            assertEquals(SessionState.SignedIn(user), graph.sessionRepository.state.value)
            assertTrue(backend.requests.isEmpty())
        }

    @Test
    fun `reopening with no stored session lands on the login`() =
        runBlocking {
            val graph = TestGraph(backend)

            graph.sessionRepository.restore()

            assertEquals(SessionState.SignedOut, graph.sessionRepository.state.value)
        }

    @Test
    fun `a 401 renews the session once and repeats the call with the new token`() =
        runBlocking {
            probeThatAcceptsOnlyTheRefreshedToken()
            backend.route("POST", "/auth/token/refresh", fixture("session-refreshed-tokens"))
            val graph = signedInGraph()

            val body = graph.apis.create(ProbeApi::class.java).probe()

            assertTrue(body.ok)
            val probes = backend.requestsTo("GET", "/api/probe")
            assertEquals(listOf("Bearer access-velho", "Bearer $refreshedAccess"), probes.map { it.getHeader("Authorization") })
            val refresh = backend.requestsTo("POST", "/auth/token/refresh").single()
            assertEquals("""{"refreshToken":"refresh-token-opaco"}""", refresh.body.readUtf8())
            assertEquals(refreshedAccess, graph.storage.session?.accessToken)
            assertEquals("refresh-token-novo", graph.storage.session?.refreshToken)
            assertEquals("Admin", graph.storage.session?.name)
        }

    @Test
    fun `a call that is still refused after the renewal is not repeated again`() =
        runBlocking {
            backend.route("GET", "/api/probe", status(401))
            backend.route("POST", "/auth/token/refresh", fixture("session-refreshed-tokens"))
            val graph = signedInGraph()
            graph.sessionRepository.restore()

            val failure = assertThrows(HttpException::class.java) { runBlocking { graph.apis.create(ProbeApi::class.java).probe() } }

            assertEquals(401, failure.code())
            assertEquals(2, backend.requestsTo("GET", "/api/probe").size)
            assertEquals(1, backend.requestsTo("POST", "/auth/token/refresh").size)
            assertEquals(SessionState.SignedIn(user), graph.sessionRepository.state.value) // só a API recusou
            assertEquals(refreshedAccess, graph.storage.session?.accessToken)
        }

    @Test
    fun `concurrent 401s share a single renewal`() =
        runBlocking {
            probeThatAcceptsOnlyTheRefreshedToken()
            val refreshes = AtomicInteger()
            backend.route("POST", "/auth/token/refresh") {
                refreshes.incrementAndGet()
                Thread.sleep(150)
                fixture("session-refreshed-tokens")
            }
            val graph = signedInGraph()
            val api = graph.apis.create(ProbeApi::class.java)

            val results = (1..6).map { async(Dispatchers.IO) { api.probe() } }.awaitAll()

            assertTrue(results.all { it.ok })
            assertEquals(1, refreshes.get())
        }

    @Test
    fun `a refused renewal erases the session and sends the user back to the login`() =
        runBlocking {
            backend.route("GET", "/api/probe", status(401))
            backend.route("POST", "/auth/token/refresh", status(401))
            val graph = signedInGraph()
            graph.sessionRepository.restore()

            val failure = assertThrows(HttpException::class.java) { runBlocking { graph.apis.create(ProbeApi::class.java).probe() } }

            assertEquals(401, failure.code())
            assertNull(graph.storage.session)
            assertEquals(SessionState.SignedOut, graph.sessionRepository.state.value)
            assertEquals(1, backend.requestsTo("GET", "/api/probe").size)
        }

    @Test
    fun `an unavailable Auth keeps the session for the next attempt`() =
        runBlocking {
            backend.route("GET", "/api/probe", status(401))
            backend.route("POST", "/auth/token/refresh", status(503))
            val graph = signedInGraph()
            graph.sessionRepository.restore()

            assertThrows(HttpException::class.java) { runBlocking { graph.apis.create(ProbeApi::class.java).probe() } }

            assertEquals(stored, graph.storage.session)
            assertEquals(SessionState.SignedIn(user), graph.sessionRepository.state.value)
        }

    @Test
    fun `signing out revokes the refresh token and erases the session`() =
        runBlocking {
            backend.route("POST", "/auth/logout", status(204))
            val graph = signedInGraph()
            graph.sessionRepository.restore()

            graph.sessionRepository.signOut()

            val logout = backend.requestsTo("POST", "/auth/logout").single()
            assertEquals("""{"refreshToken":"refresh-token-opaco"}""", logout.body.readUtf8())
            assertNull(graph.storage.session)
            assertEquals(SessionState.SignedOut, graph.sessionRepository.state.value)
        }

    @Test
    fun `signing out works even when Auth is down`() =
        runBlocking {
            backend.route("POST", "/auth/logout", status(503))
            val graph = signedInGraph()

            graph.sessionRepository.signOut()

            assertNull(graph.storage.session)
            assertEquals(SessionState.SignedOut, graph.sessionRepository.state.value)
        }

    @Test
    fun `requests without a session carry no bearer`() =
        runBlocking {
            backend.route("GET", "/api/probe", status(401))
            val graph = TestGraph(backend)

            assertThrows(HttpException::class.java) { runBlocking { graph.apis.create(ProbeApi::class.java).probe() } }

            assertNull(backend.requestsTo("GET", "/api/probe").single().getHeader("Authorization"))
            assertEquals(0, backend.requestsTo("POST", "/auth/token/refresh").size)
        }
}
