package app.braid.mobile.ui.agenda

import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.TestViewModes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
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
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class AgendaViewModelTest {
    private val window = Fixtures.json("tasks-agenda-window").jsonObject
    private val now = Instant.parse(window.getValue("now").jsonPrimitive.content)
    private val tasksPath = "/api/tasks"

    @get:Rule
    val folder = TemporaryFolder()

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private lateinit var viewModes: TestViewModes

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        viewModes = TestViewModes(folder.root.resolve("settings.preferences_pb"))
    }

    @After
    fun tearDown() {
        // O ViewModel segue lendo a escolha guardada: para antes de fechar o DataStore e de soltar o Main de teste.
        created.forEach { it.viewModelScope.cancel() }
        viewModes.close()
        backend.close()
        Dispatchers.resetMain()
    }

    private val created = mutableListOf<AgendaViewModel>()

    private fun newViewModel(clock: AppClock = AppClock { now }): AgendaViewModel =
        AgendaViewModel(DefaultTaskRepository(graph.apis.create(TasksApi::class.java)), viewModes.repository, clock).also(created::add)

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

    @Test
    fun `choosing You asks the API for human tasks and reads the week again`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()
            viewModel.settled()
            backend.route("GET", tasksPath, fixture("tasks-agenda-empty"))

            viewModes.repository.select(ViewMode.Human)
            val state = viewModel.state.first { it.viewMode == ViewMode.Human && it.load == AgendaLoad.Idle && it.tasksByDay.isNotEmpty() }

            val last = backend.requestsTo("GET", tasksPath).last().requestUrl!!
            assertEquals("human", last.queryParameter("actor"))
            assertEquals(window.getValue("from").jsonPrimitive.content, last.queryParameter("from"))
            assertTrue(ids(state, "2026-09-14").isEmpty())
        }

    @Test
    fun `choosing Agents asks for agent tasks and Everyone drops the filter`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()
            viewModel.settled()

            viewModes.repository.select(ViewMode.Agent)
            viewModel.state.first { it.viewMode == ViewMode.Agent && it.load == AgendaLoad.Idle && it.tasksByDay.isNotEmpty() }
            assertEquals(
                "agent",
                backend
                    .requestsTo("GET", tasksPath)
                    .last()
                    .requestUrl!!
                    .queryParameter("actor"),
            )

            viewModes.repository.select(ViewMode.All)
            viewModel.state.first { it.viewMode == ViewMode.All && it.load == AgendaLoad.Idle && it.tasksByDay.isNotEmpty() }
            assertNull(
                backend
                    .requestsTo("GET", tasksPath)
                    .last()
                    .requestUrl!!
                    .queryParameter("actor"),
            )
        }

    @Test
    fun `a choice stored before opening the app is the one the first read uses`() =
        runTest {
            viewModes.repository.select(ViewMode.Human)
            routeWeekOfToday()

            newViewModel().settled()

            val requests = backend.requestsTo("GET", tasksPath)
            assertTrue(requests.isNotEmpty())
            assertTrue(requests.all { it.requestUrl!!.queryParameter("actor") == "human" })
        }

    @Test
    fun `the search keeps the loaded tasks whose name has the text, ignoring case and accents`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()
            val loaded = viewModel.settled()
            val requestsBefore = backend.requests.size
            val names = loaded.tasksByDay.getValue("2026-09-14").associate { it.id to it.name }
            val target = names.values.first()

            viewModel.search(target.uppercase())

            val state = viewModel.state.value
            assertTrue(state.searching)
            assertEquals(
                names.filterValues { it.equals(target, ignoreCase = true) }.keys.toList(),
                state.shownOn("2026-09-14")!!.map { it.id },
            )
            // Uma busca sem resultado deixa o dia visível e vazio, e a busca não lê nada de novo.
            viewModel.search("zzz-nada")
            assertEquals(
                emptyList<String>(),
                viewModel.state.value
                    .shownOn("2026-09-14")!!
                    .map { it.id },
            )
            assertEquals(requestsBefore, backend.requests.size)
        }

    @Test
    fun `clearing the search shows every task again and a day that has not arrived stays unknown`() =
        runTest {
            routeWeekOfToday()
            val viewModel = newViewModel()
            val loaded = viewModel.settled()
            viewModel.search("reuniao")

            viewModel.search("")

            assertEquals(false, viewModel.state.value.searching)
            assertEquals(
                loaded.tasksByDay.getValue("2026-09-14").map { it.id },
                viewModel.state.value
                    .shownOn("2026-09-14")!!
                    .map { it.id },
            )
            assertNull(viewModel.state.value.shownOn("2030-01-01"))
        }
}
