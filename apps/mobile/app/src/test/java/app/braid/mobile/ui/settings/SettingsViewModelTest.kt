package app.braid.mobile.ui.settings

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.data.settings.DataStoreThemeRepository
import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.reminder.ReminderSync
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.settings.ThemeChoice
import app.braid.mobile.domain.task.TaskChanges
import app.braid.mobile.support.FakeReminderAlarms
import app.braid.mobile.support.FakeReminderNotifier
import app.braid.mobile.support.InMemoryFiredKeys
import app.braid.mobile.support.InMemorySessionStorage
import app.braid.mobile.support.MutableClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.closeAndJoin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant

/**
 * "Configurações" do chat: o tema (DataStore de verdade) e o "Sair da conta" (Auth no `MockWebServer`, sessão e
 * lembretes de verdade). Só o relógio, o AlarmManager, a notificação e o armazenamento da sessão são trocados.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val scopes = mutableListOf<CoroutineScope>()
    private val stored =
        StoredSession(
            accessToken = "access-velho",
            refreshToken = "refresh-token-opaco",
            userId = "user-1",
            email = "admin@admin.com",
            name = "Admin",
        )
    private val clock = MutableClock(Instant.parse("2026-09-14T15:00:00.000Z"))
    private val alarms = FakeReminderAlarms()
    private val fired = InMemoryFiredKeys()
    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private lateinit var sync: ReminderSync

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        backend.route("GET", "/api/tasks", fixture("notifications-agenda-page"))
        backend.route("GET", "/api/tasks/tracked", fixture("notifications-tracked"))
        backend.route("POST", "/auth/logout", status(204))
        graph = TestGraph(backend, InMemorySessionStorage(stored))
        val api = graph.apis.create(TasksApi::class.java)
        sync = ReminderSync(DefaultTaskRepository(api, TaskChanges()), alarms, FakeReminderNotifier(), fired, clock)
    }

    @After
    fun tearDown() {
        backend.close()
        runBlocking { scopes.closeAndJoin() }
        Dispatchers.resetMain()
    }

    private fun themeStore() =
        PreferenceDataStoreFactory.create(scope = CoroutineScope(SupervisorJob() + Dispatchers.IO).also(scopes::add)) {
            folder.root.resolve("settings.preferences_pb")
        }

    private fun newViewModel() = SettingsViewModel(DataStoreThemeRepository(themeStore()), graph.sessionRepository, sync)

    private suspend fun SettingsViewModel.await(predicate: (SettingsUiState) -> Boolean): SettingsUiState =
        withTimeout(5_000) { state.first(predicate) }

    @Test
    fun `with no choice stored the system decides`() =
        runBlocking {
            val viewModel = newViewModel()

            assertNull(viewModel.state.value.themeChoice)
        }

    @Test
    fun `the toggle goes to dark when the screen is light, and the choice is stored`() =
        runBlocking {
            val viewModel = newViewModel()

            viewModel.toggleTheme(currentlyDark = false)

            assertEquals(ThemeChoice.Dark, viewModel.await { it.themeChoice != null }.themeChoice)
        }

    @Test
    fun `the toggle goes to light when the screen is dark, even if the system is the one making it dark`() =
        runBlocking {
            val viewModel = newViewModel()

            viewModel.toggleTheme(currentlyDark = true)

            assertEquals(ThemeChoice.Light, viewModel.await { it.themeChoice != null }.themeChoice)
        }

    @Test
    fun `the choice is still there after closing and reopening the app`() =
        runBlocking {
            val first = newViewModel()
            first.toggleTheme(currentlyDark = false)
            first.await { it.themeChoice == ThemeChoice.Dark }
            scopes.closeAndJoin()

            assertEquals(ThemeChoice.Dark, newViewModel().await { it.themeChoice != null }.themeChoice)
        }

    @Test
    fun `the sign-out button exists only with a session user`() =
        runBlocking {
            graph.sessionRepository.restore()
            assertTrue(newViewModel().state.value.signedIn)

            val signedOut = TestGraph(backend)
            signedOut.sessionRepository.restore()
            val viewModel = SettingsViewModel(DataStoreThemeRepository(themeStore()), signedOut.sessionRepository, sync)
            assertFalse(viewModel.state.value.signedIn)
        }

    @Test
    fun `signing out revokes the refresh token, wipes the session and cancels the reminders`() =
        runBlocking {
            graph.sessionRepository.restore()
            sync.refresh()
            assertTrue(alarms.scheduled.isNotEmpty())
            fired.stored = mapOf("meeting:2026-09-14T18:00:00.000Z:60" to Instant.parse("2026-09-14T18:00:00Z"))
            val viewModel = newViewModel()

            viewModel.signOut()
            viewModel.await { !it.signedIn }

            assertEquals(
                """{"refreshToken":"refresh-token-opaco"}""",
                backend
                    .requestsTo("POST", "/auth/logout")
                    .single()
                    .body
                    .readUtf8(),
            )
            assertNull(graph.storage.session)
            assertEquals(SessionState.SignedOut, graph.sessionRepository.state.value)
            assertTrue(alarms.scheduled.isEmpty())
            assertEquals(emptyMap<String, Instant>(), fired.stored)
        }

    @Test
    fun `an Auth that errors does not keep the person from leaving`() =
        runBlocking {
            backend.route("POST", "/auth/logout", status(503))
            graph.sessionRepository.restore()
            sync.refresh()
            val viewModel = newViewModel()

            viewModel.signOut()
            viewModel.await { !it.signedIn }

            assertNull(graph.storage.session)
            assertTrue(alarms.scheduled.isEmpty())
        }

    @Test
    fun `an Auth that drops the connection does not keep the person from leaving`() =
        runBlocking {
            backend.route("POST", "/auth/logout", MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            graph.sessionRepository.restore()
            sync.refresh()
            val viewModel = newViewModel()

            viewModel.signOut()
            viewModel.await { !it.signedIn }

            assertNull(graph.storage.session)
            assertEquals(SessionState.SignedOut, graph.sessionRepository.state.value)
            assertTrue(alarms.scheduled.isEmpty())
        }
}
