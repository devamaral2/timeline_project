package app.braid.mobile.ui.auth

import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.session.SessionUser
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private lateinit var viewModel: LoginViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        viewModel = LoginViewModel(graph.sessionRepository)
    }

    @After
    fun tearDown() {
        backend.close()
        Dispatchers.resetMain()
    }

    private fun fillIn(
        email: String = "admin@admin.com",
        password: String = "correct horse battery staple",
    ) {
        viewModel.onEmailChange(email)
        viewModel.onPasswordChange(password)
    }

    /** Dispara o envio e espera a falha aparecer no formulário. */
    private suspend fun submitAndSettle(): LoginUiState {
        lateinit var settled: LoginUiState
        viewModel.state.test {
            viewModel.submit()
            var latest = awaitItem()
            while (latest.error == null) latest = awaitItem()
            settled = latest
            cancelAndIgnoreRemainingEvents()
        }
        return settled
    }

    @Test
    fun `signing in calls the Auth directly and keeps the user`() =
        runTest {
            backend.route("POST", "/auth/login", fixture("session-login-tokens", code = 201))
            backend.route("GET", "/auth/me", fixture("session-current-user"))
            fillIn(email = "  admin@admin.com ")

            viewModel.submit()
            awaitSignedIn()

            assertEquals(
                SessionState.SignedIn(SessionUser(userId = "user-1", name = "Admin", email = "admin@admin.com")),
                graph.sessionRepository.state.value,
            )
            val login = backend.requestsTo("POST", "/auth/login").single()
            assertEquals("""{"email":"admin@admin.com","password":"correct horse battery staple"}""", login.body.readUtf8())
            assertNull(login.getHeader("Authorization"))
            val accessToken =
                Fixtures
                    .json("session-login-tokens")
                    .jsonObject["accessToken"]!!
                    .jsonPrimitive.content
            assertEquals("Bearer $accessToken", backend.requestsTo("GET", "/auth/me").single().getHeader("Authorization"))
            assertEquals(accessToken, graph.storage.session?.accessToken)
            assertEquals("refresh-token-opaco", graph.storage.session?.refreshToken)
            assertEquals("Admin", graph.storage.session?.name)
        }

    @Test
    fun `wrong credentials show the web message and store nothing`() =
        runTest {
            backend.route("POST", "/auth/login", status(401))
            fillIn()

            val result = submitAndSettle()

            assertEquals("E-mail ou senha incorretos.", result.error)
            assertFalse(result.submitting)
            assertNull(graph.storage.session)
            assertTrue(backend.requestsTo("GET", "/auth/me").isEmpty())
        }

    @Test
    fun `too many attempts show the rate limit message`() =
        runTest {
            backend.route("POST", "/auth/login", status(429))
            fillIn()

            assertEquals("Muitas tentativas. Aguarde um pouco e tente novamente.", submitAndSettle().error)
        }

    @Test
    fun `an unavailable Auth shows the unavailable message`() =
        runTest {
            backend.route("POST", "/auth/login", status(503))
            fillIn()

            assertEquals("Não foi possível entrar agora. Tente novamente em instantes.", submitAndSettle().error)
        }

    @Test
    fun `failing to read the user after the login does not leave a half session`() =
        runTest {
            backend.route("POST", "/auth/login", fixture("session-login-tokens", code = 201))
            backend.route("GET", "/auth/me", status(500))
            fillIn()

            val result = submitAndSettle()

            assertEquals("Não foi possível entrar agora. Tente novamente em instantes.", result.error)
            assertNull(graph.storage.session)
        }

    @Test
    fun `a new attempt clears the previous error`() =
        runTest {
            backend.route("POST", "/auth/login", status(401), fixture("session-login-tokens", code = 201))
            backend.route("GET", "/auth/me", fixture("session-current-user"))
            fillIn()
            assertEquals("E-mail ou senha incorretos.", submitAndSettle().error)

            viewModel.submit()
            awaitSignedIn()

            assertNull(viewModel.state.value.error)
        }

    @Test
    fun `the button needs both fields, as in the web`() {
        assertFalse(viewModel.state.value.canSubmit)
        viewModel.onEmailChange("admin@admin.com")
        assertFalse(viewModel.state.value.canSubmit)
        viewModel.onPasswordChange("senha")
        assertTrue(viewModel.state.value.canSubmit)
    }

    @Test
    fun `fields are limited to what the Auth accepts`() {
        val examples = Fixtures.json("session-login-request").jsonObject
        (examples["valid"] as JsonArray).forEach {
            val body = it as JsonObject
            fillIn(body["email"]!!.jsonPrimitive.content, body["password"]!!.jsonPrimitive.content)
            assertTrue(viewModel.state.value.canSubmit)
        }
        (examples["invalid"] as JsonArray).map { it as JsonObject }.forEach { body ->
            fillIn(body["email"]!!.jsonPrimitive.content, body["password"]!!.jsonPrimitive.content)
            val state = viewModel.state.value
            // O formulário trava o envio ou corta o texto no limite: nunca manda o que o Auth recusa.
            assertTrue(!state.canSubmit || (state.email.length <= 320 && state.password.length <= 1024))
        }
    }

    private suspend fun awaitSignedIn() {
        graph.sessionRepository.state.test {
            var latest = awaitItem()
            while (latest !is SessionState.SignedIn) latest = awaitItem()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
