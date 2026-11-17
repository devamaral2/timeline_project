package app.braid.mobile.ui.agenda

import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class AgendaViewModelTest {
    private val window = Fixtures.json("tasks-agenda-window").jsonObject
    private val now = Instant.parse(window.getValue("now").jsonPrimitive.content)
    private val tasksPath = "/api/tasks"

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
    }

    @After
    fun tearDown() {
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(clock: AppClock = AppClock { now }): AgendaViewModel =
        AgendaViewModel(DefaultTaskRepository(graph.apis.create(TasksApi::class.java)), clock)

    private suspend fun AgendaViewModel.settled(): AgendaUiState = state.first { it.load != AgendaLoad.Loading }

    private fun routeWeekOfToday() {
        backend.route("GET", tasksPath, fixture("tasks-agenda-page-1"), fixture("tasks-agenda-page-2"))
    }

    private fun ids(
        state: AgendaUiState,
        dayKey: String,
    ): List<String> = state.tasksByDay.getValue(dayKey).map { it.id }

    private fun expectedIds(dayKey: String): List<String> =
        (window.getValue("idsByDay").jsonObject[dayKey] as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList()

    @Test
    fun `it opens on today, with the week still loading`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()

            val first = viewModel.state.value
            assertEquals("2026-09-14", first.todayKey)
            assertEquals("2026-09-14", first.selectedDay)
            assertEquals(now, first.now)
        }

    @Test
    fun `it reads the whole week of the selected day, following the cursor`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()

            val state = viewModel.settled()

            assertEquals(AgendaLoad.Idle, state.load)
            val requests = backend.requestsTo("GET", tasksPath)
            assertEquals(2, requests.size)
            val firstQuery = requests[0].requestUrl!!
            assertEquals(window.getValue("from").jsonPrimitive.content, firstQuery.queryParameter("from"))
            assertEquals(window.getValue("to").jsonPrimitive.content, firstQuery.queryParameter("to"))
            assertNull(firstQuery.queryParameter("cursor"))
            assertNull(firstQuery.queryParameter("limit"))
            assertNull(firstQuery.queryParameter("actor"))
            assertEquals("cursor-1", requests[1].requestUrl!!.queryParameter("cursor"))
            assertEquals(window.getValue("from").jsonPrimitive.content, requests[1].requestUrl!!.queryParameter("from"))
        }

    @Test
    fun `each day shows what the web shows, sorted, with a card repeated across pages kept once`() =
        runTest {
            routeWeekOfToday()
            val state = newViewModel().settled()

            val weekDays = (window.getValue("weekDays") as JsonArray).map { it.jsonPrimitive.content }
            for (dayKey in weekDays) {
                assertEquals("day $dayKey", expectedIds(dayKey), ids(state, dayKey))
            }
        }

    @Test
    fun `a task that crosses midnight is on both days and long tasks and steps are nowhere`() =
        runTest {
            routeWeekOfToday()
            val state = newViewModel().settled()

            assertTrue("task-6" in ids(state, "2026-09-14"))
            assertTrue("task-6" in ids(state, "2026-09-15"))
            val shown =
                state.tasksByDay.values
                    .flatten()
                    .map { it.id }
                    .toSet()
            assertTrue("task-8" !in shown)
            assertTrue("task-13" !in shown)
        }

    @Test
    fun `a day with no tasks is loaded and empty, not missing`() =
        runTest {
            backend.route("GET", tasksPath, fixture("tasks-agenda-empty"))
            val state = newViewModel().settled()

            assertEquals(emptyList<String>(), ids(state, "2026-09-14"))
            assertEquals(7, state.tasksByDay.size)
        }

    @Test
    fun `choosing a day in the loaded week does not ask the server again`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()
            viewModel.settled()
            val before = backend.requestsTo("GET", tasksPath).size

            viewModel.selectDay("2026-09-17")

            assertEquals("2026-09-17", viewModel.state.value.selectedDay)
            assertEquals(before, backend.requestsTo("GET", tasksPath).size)
        }

    @Test
    fun `choosing a day in another week reads that week and keeps the one already loaded`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()
            viewModel.settled()
            backend.route("GET", tasksPath, fixture("tasks-agenda-empty"))

            viewModel.selectDay("2026-09-23")
            val state = viewModel.state.first { "2026-09-23" in it.tasksByDay }

            val last = backend.requestsTo("GET", tasksPath).last().requestUrl!!
            // 20 a 26 de setembro: domingo à meia-noite de São Paulo até o fim do sábado.
            assertEquals("2026-09-20T03:00:00.000Z", last.queryParameter("from"))
            assertEquals("2026-09-27T02:59:59.999Z", last.queryParameter("to"))
            assertEquals(AgendaLoad.Idle, state.load)
            assertEquals(expectedIds("2026-09-14"), ids(state, "2026-09-14"))
        }

    @Test
    fun `a network failure shows the error and trying again reads the week`() =
        runTest {
            backend.route("GET", tasksPath, status(503), fixture("tasks-agenda-page-1"), fixture("tasks-agenda-page-2"))
            val viewModel = newViewModel()

            val failed = viewModel.settled()
            assertEquals(AgendaLoad.Failed, failed.load)
            assertTrue(failed.tasksByDay.isEmpty())

            viewModel.retry()
            val recovered = viewModel.state.first { it.load == AgendaLoad.Idle }

            assertEquals(expectedIds("2026-09-14"), ids(recovered, "2026-09-14"))
        }

    @Test
    fun `a malformed answer is a failure and not a crash`() =
        runTest {
            backend.route("GET", tasksPath, fixture("session-current-user"))
            assertEquals(AgendaLoad.Failed, newViewModel().settled().load)
        }

    @Test
    fun `coming back to the app rereads the week without showing the skeleton`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()
            viewModel.settled()
            val before = backend.requestsTo("GET", tasksPath).size
            backend.route("GET", tasksPath, fixture("tasks-agenda-empty"))

            viewModel.onResume()
            val state = viewModel.state.first { ids(it, "2026-09-14").isEmpty() }

            assertEquals(AgendaLoad.Idle, state.load)
            assertTrue(backend.requestsTo("GET", tasksPath).size > before)
        }

    @Test
    fun `after midnight the new today is read on resume`() =
        runTest {
            routeWeekOfToday()
            var current = now
            val viewModel = newViewModel { current }
            viewModel.settled()

            current = Instant.parse("2026-09-15T12:00:00.000Z")
            viewModel.onResume()

            assertEquals("2026-09-15", viewModel.state.value.todayKey)
            // Quem deixou o app aberto em "hoje" amanhece em "hoje".
            assertEquals("2026-09-15", viewModel.state.value.selectedDay)
        }
}
