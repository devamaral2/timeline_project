package app.braid.mobile.ui.notifications

import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.task.TaskChanges
import app.braid.mobile.support.InMemoryReadKeys
import app.braid.mobile.support.MutableClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/**
 * O feed do chat pela rede: a fonte (agenda e acompanhadas) vem do `MockWebServer` com as fixtures dos lembretes; só o
 * relógio e o armazenamento das chaves lidas são trocados.
 *
 * Às 12:00 em São Paulo (15:00Z) de 14/09/2026, as tarefas da fixture dão, em "Recentes": a entrega longa (aviso de
 * 2 dias, venceu às 12:00Z) e a reunião (aviso de 1 dia, venceu às 18:00Z de 13/09); em "Próximos", os cinco primeiros:
 * a reunião às 17:00Z, 17:30Z e 17:55Z, o condomínio em 15/09 às 12:45Z e a entrega longa em 16/09 às 11:00Z.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsViewModelTest {
    private val start = Instant.parse("2026-09-14T15:00:00.000Z")
    private val zone = ZoneId.of("America/Sao_Paulo")
    private val clock = MutableClock(start)
    private val readKeys = InMemoryReadKeys()
    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val created = mutableListOf<NotificationsViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        backend.route("GET", "/api/tasks", fixture("notifications-agenda-page"))
        backend.route("GET", "/api/tasks/tracked", fixture("notifications-tracked"))
    }

    @After
    fun tearDown() {
        created.forEach { it.viewModelScope.cancel() }
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(): NotificationsViewModel =
        NotificationsViewModel(
            DefaultTaskRepository(graph.apis.create(TasksApi::class.java), TaskChanges()),
            readKeys,
            clock,
            zone,
        ).also(created::add)

    private suspend fun NotificationsViewModel.loaded(): NotificationsUiState = state.first { it.loaded }

    private suspend fun awaitReads(count: Int) =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) { while (backend.requestsTo("GET", "/api/tasks").size < count) delay(5) }
        }

    private val deliveryKey = "project:2026-09-16T12:00:00.000Z:2880"
    private val meetingKey = "meeting:2026-09-14T18:00:00.000Z:1440"

    @Test
    fun `it reads the agenda from 24 hours ago to 31 days ahead and the tracked list`() =
        runTest {
            newViewModel().loaded()

            val agenda = backend.requestsTo("GET", "/api/tasks").single().requestUrl!!
            assertEquals("2026-09-13T15:00:00.000Z", agenda.queryParameter("from"))
            assertEquals("2026-10-15T15:00:00.000Z", agenda.queryParameter("to"))
            assertEquals(1, backend.requestsTo("GET", "/api/tasks/tracked").size)
        }

    @Test
    fun `recent comes newest first and upcoming nearest first, with the web's texts`() =
        runTest {
            val state = newViewModel().loaded()

            assertEquals(
                listOf(
                    NotificationRow(deliveryKey, "project", "Entrega do projeto", "Tarefa · 2 dias antes", "há 3 h", unread = true),
                    NotificationRow(meetingKey, "meeting", "Reunião de planejamento", "Tarefa · 1 dia antes", "há 21 h", unread = true),
                ),
                state.recent,
            )
            assertEquals(
                listOf(
                    Triple("Reunião de planejamento", "Tarefa · 60 minutos antes", "hoje às 14:00"),
                    Triple("Reunião de planejamento", "Tarefa · 30 minutos antes", "hoje às 14:30"),
                    Triple("Reunião de planejamento", "Tarefa · 5 minutos antes", "hoje às 14:55"),
                    Triple("Pagar o condomínio", "Tarefa · 15 minutos antes", "amanhã às 09:45"),
                    Triple("Entrega do projeto", "Tarefa · 60 minutos antes", "16/09 às 08:00"),
                ),
                state.upcoming.map { Triple(it.name, it.detail, it.caption) },
            )
            assertEquals(listOf("meeting", "meeting", "meeting", "bill", "project"), state.upcoming.map { it.taskId })
            assertTrue(state.upcoming.none { it.unread })
            assertEquals(2, state.unreadCount)
            assertFalse(state.isEmpty)
        }

    @Test
    fun `opening a recent notice marks it read and it stays read after the app reopens`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.loaded()

            viewModel.markRead(deliveryKey)

            val state = viewModel.state.value
            assertEquals(listOf(false, true), state.recent.map { it.unread })
            assertEquals(1, state.unreadCount)
            assertEquals(mapOf(deliveryKey to Instant.parse("2026-09-16T12:00:00Z")), readKeys.stored)

            val reopened = newViewModel().loaded()
            assertEquals(listOf(false, true), reopened.recent.map { it.unread })
        }

    @Test
    fun `mark all as read clears the counter`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.loaded()

            viewModel.markAllRead()

            assertEquals(0, viewModel.state.value.unreadCount)
            assertTrue(
                viewModel.state.value.recent
                    .none { it.unread },
            )
            assertEquals(setOf(deliveryKey, meetingKey), readKeys.stored.keys)
        }

    @Test
    fun `read keys of tasks older than 48 hours are forgotten when a new one is saved`() =
        runTest {
            readKeys.stored =
                mapOf(
                    "old:2026-09-11T14:59:00.000Z:5" to Instant.parse("2026-09-11T14:59:00Z"),
                    "edge:2026-09-12T15:00:00.000Z:5" to Instant.parse("2026-09-12T15:00:00Z"),
                )
            val viewModel = newViewModel()
            viewModel.loaded()

            viewModel.markRead(deliveryKey)

            assertEquals(setOf("edge:2026-09-12T15:00:00.000Z:5", deliveryKey), readKeys.stored.keys)
        }

    @Test
    fun `without notices the feed is empty`() =
        runTest {
            backend.route("GET", "/api/tasks", fixture("notifications-agenda-empty"))
            backend.route("GET", "/api/tasks/tracked", fixture("notifications-tracked-empty"))

            val state = newViewModel().loaded()

            assertTrue(state.isEmpty)
            assertTrue(state.recent.isEmpty() && state.upcoming.isEmpty())
            assertEquals(0, state.unreadCount)
        }

    @Test
    fun `refreshing reads the sources again and follows a rescheduled task`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.loaded()
            backend.route("GET", "/api/tasks", fixture("notifications-agenda-rescheduled"))
            clock.advance(Duration.ofMinutes(5))

            viewModel.refresh()
            awaitReads(2)
            val state = viewModel.state.first { it.upcoming.any { row -> row.caption == "hoje às 15:55" } }

            assertEquals(2, backend.requestsTo("GET", "/api/tasks/tracked").size)
            assertTrue(state.recent.all { it.caption.startsWith("há ") })
        }

    @Test
    fun `retiming moves the captions with the clock and reads nothing`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.loaded()

            clock.advance(Duration.ofHours(1))
            viewModel.retime()

            assertEquals(
                listOf("há 4 h", "há 22 h"),
                viewModel.state.value.recent
                    .map { it.caption },
            )
            assertEquals(1, backend.requestsTo("GET", "/api/tasks").size)
        }

    @Test
    fun `when one list fails the other still fills the feed, and when both fail the last feed stays`() =
        runTest {
            backend.route("GET", "/api/tasks") { status(500) }
            val viewModel = newViewModel()
            val partial = viewModel.loaded()
            // Só as acompanhadas responderam: a reunião e a entrega longa.
            assertEquals(listOf("project", "meeting"), partial.recent.map { it.taskId })

            backend.route("GET", "/api/tasks/tracked") { status(500) }
            viewModel.refresh()
            awaitReads(2)
            delay(50)

            assertEquals(partial.recent, viewModel.state.value.recent)
        }
}
