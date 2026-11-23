package app.braid.mobile.ui.agenda

import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.TestViewModes
import app.braid.mobile.support.stopAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
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

/** Mudar o status pelo ponto da tarefa de referência na agenda, e a releitura das tarefas de agente abertas. */
@OptIn(ExperimentalCoroutinesApi::class)
class AgendaStatusViewModelTest {
    private val window = Fixtures.json("tasks-agenda-window").jsonObject
    private val change = Fixtures.json("tasks-status-change").jsonObject
    private val weekNow = Instant.parse(window.getValue("now").jsonPrimitive.content)
    private val changeNow = Instant.parse(change.getValue("now").jsonPrimitive.content)
    private val tasksPath = "/api/tasks"
    private val referencePath = "/api/tasks/task-9"
    private val today = "2026-09-14"

    @get:Rule
    val folder = TemporaryFolder()

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private lateinit var viewModes: TestViewModes
    private val created = mutableListOf<AgendaViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        viewModes = TestViewModes(folder.root.resolve("settings.preferences_pb"))
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        viewModes.close()
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(now: Instant = weekNow): AgendaViewModel =
        AgendaViewModel(
            DefaultTaskRepository(graph.apis.create(TasksApi::class.java)),
            viewModes.repository,
            viewModes.freeTime,
            AppClock { now },
        ).also(created::add)

    private suspend fun AgendaViewModel.settled(): AgendaUiState = state.first { it.load != AgendaLoad.Loading }

    /** A semana inteira, nas duas páginas que o servidor devolve, até alguém mudar o que ela serve. */
    private fun serveWeek(afterwards: () -> MockResponse? = { null }) {
        backend.route("GET", tasksPath) { request ->
            afterwards()
                ?: if (request.requestUrl!!.queryParameter("cursor") ==
                    null
                ) {
                    fixture("tasks-agenda-page-1")
                } else {
                    fixture("tasks-agenda-page-2")
                }
        }
    }

    private fun card(
        state: AgendaUiState,
        id: String,
    ): TaskCard =
        state.tasksByDay.values
            .flatten()
            .first { it.id == id }

    private fun weekReads(): Int = backend.requestsTo("GET", tasksPath).count { it.requestUrl!!.queryParameter("cursor") == null }

    /** Espera o servidor de teste receber [count] leituras da semana, em tempo real: a rede não anda no relógio virtual. */
    private suspend fun awaitWeekReads(count: Int) =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) { while (weekReads() < count) delay(5) }
        }

    private fun patchBody(index: Int = 0): JsonObject =
        Json
            .parseToJsonElement(
                backend
                    .requestsTo("PATCH", referencePath)[index]
                    .body
                    .clone()
                    .readUtf8(),
            ).jsonObject

    /** O corpo que o web manda ao sair de "só agenda" (sem status) para [to], gerado por `statusPatch`. */
    private fun expectedPatch(to: String): JsonObject =
        (change.getValue("patches") as JsonArray)
            .map { it.jsonObject }
            .first { it.getValue("from") is JsonNull && it.getValue("to").jsonPrimitive.content == to }
            .getValue("patch")
            .jsonObject

    @Test
    fun `tapping the reference dot opens the picker for that task`() =
        runTest {
            serveWeek()
            val viewModel = newViewModel()
            val reference = card(viewModel.settled(), "task-9")

            viewModel.openStatusPicker(reference)

            assertEquals(
                "task-9",
                viewModel.state.value.statusPicker
                    ?.id,
            )
        }

    @Test
    fun `a person task that already has a status, an agent task and a late dismissal open nothing`() =
        runTest {
            serveWeek()
            val viewModel = newViewModel()
            val loaded = viewModel.settled()

            viewModel.openStatusPicker(card(loaded, "task-1"))
            assertNull(viewModel.state.value.statusPicker)
            viewModel.openStatusPicker(card(loaded, "task-3"))
            assertNull(viewModel.state.value.statusPicker)

            viewModel.openStatusPicker(card(loaded, "task-9"))
            viewModel.dismissStatusPicker()
            assertNull(viewModel.state.value.statusPicker)
            assertTrue(backend.requestsTo("PATCH", referencePath).isEmpty())
        }

    @Test
    fun `choosing a status closes the picker, sends the revision that was read and shows the re-read task`() =
        runTest {
            var saved = false
            serveWeek { if (saved) fixture("tasks-agenda-reference-doing") else null }
            backend.route("PATCH", referencePath) {
                saved = true
                MockResponse().setResponseCode(204)
            }
            val viewModel = newViewModel()
            viewModel.openStatusPicker(card(viewModel.settled(), "task-9"))

            viewModel.chooseStatus(TaskStatus.Doing)
            assertNull(viewModel.state.value.statusPicker)
            val after = viewModel.state.first { card(it, "task-9").status == TaskStatus.Doing }

            assertEquals(expectedPatch("doing"), patchBody())
            assertEquals(4, patchBody()["expectedRevision"]?.jsonPrimitive?.content?.toInt())
            assertEquals(5, card(after, "task-9").revision)
            assertNull(after.notice)
            assertEquals(AgendaLoad.Idle, after.load)
        }

    @Test
    fun `finishing a task sends finishedAt with the current instant`() =
        runTest {
            var saved = false
            serveWeek { if (saved) fixture("tasks-agenda-reference-done") else null }
            backend.route("PATCH", referencePath) {
                saved = true
                MockResponse().setResponseCode(204)
            }
            val viewModel = newViewModel(now = changeNow)
            viewModel.openStatusPicker(card(viewModel.settled(), "task-9"))

            viewModel.chooseStatus(TaskStatus.Done)
            viewModel.state.first { card(it, "task-9").status == TaskStatus.Done }

            val body = patchBody()
            assertEquals(expectedPatch("done"), body)
            assertEquals("2026-09-14T15:30:45.123Z", body["finishedAt"]?.jsonPrimitive?.content)
        }

    @Test
    fun `a stale revision re-reads the day and warns`() =
        runTest {
            var conflicted = false
            serveWeek { if (conflicted) fixture("tasks-agenda-reference-doing") else null }
            backend.route("PATCH", referencePath) {
                conflicted = true
                MockResponse().setResponseCode(409).setBody("{}")
            }
            val viewModel = newViewModel()
            viewModel.openStatusPicker(card(viewModel.settled(), "task-9"))

            viewModel.chooseStatus(TaskStatus.Todo)
            val after = viewModel.state.first { card(it, "task-9").status == TaskStatus.Doing }

            assertEquals("Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira e tente de novo.", after.notice)
            assertEquals(5, card(after, "task-9").revision)
        }

    @Test
    fun `a refused change warns without re-reading, and the next pick clears the warning`() =
        runTest {
            serveWeek()
            backend.route("PATCH", referencePath, status(500), MockResponse().setResponseCode(204))
            val viewModel = newViewModel()
            val loaded = viewModel.settled()
            val readsBefore = backend.requestsTo("GET", tasksPath).size
            viewModel.openStatusPicker(card(loaded, "task-9"))

            viewModel.chooseStatus(TaskStatus.Cancel)
            val failed = viewModel.state.first { it.notice != null }

            assertEquals("Não foi possível trocar o status. Tente novamente.", failed.notice)
            assertEquals(readsBefore, backend.requestsTo("GET", tasksPath).size)
            assertEquals(null, card(failed, "task-9").status)

            viewModel.openStatusPicker(card(failed, "task-9"))
            viewModel.chooseStatus(TaskStatus.Cancel)
            assertNull(viewModel.state.value.notice)
        }

    @Test
    fun `with an agent task open the agenda re-reads every 3 seconds in silence`() =
        runTest {
            serveWeek()
            val viewModel = newViewModel()
            val seen = mutableListOf<AgendaLoad>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { viewModel.state.collect { seen += it.load } }
            viewModel.setVisible(true)
            viewModel.settled()
            val before = weekReads()

            advanceTimeBy(2_999)
            runCurrent()
            assertEquals(before, weekReads())

            advanceTimeBy(1)
            runCurrent()
            awaitWeekReads(before + 1)
            val state = viewModel.state.first { it.load == AgendaLoad.Idle }

            assertTrue(weekReads() > before)
            assertEquals(listOf(AgendaLoad.Loading, AgendaLoad.Idle), seen.distinct())
            assertEquals(TaskStatus.Running, card(state, "task-3").status)
            assertEquals(TaskActor.Agent, card(state, "task-3").actor)
        }

    @Test
    fun `it stops re-reading when no agent task is left open`() =
        runTest {
            var finished = false
            serveWeek { if (finished) fixture("tasks-agenda-agents-finished") else null }
            val viewModel = newViewModel()
            viewModel.setVisible(true)
            viewModel.settled()
            finished = true

            advanceTimeBy(3_000)
            runCurrent()
            val state = viewModel.state.first { it.tasksByDay.getValue(today).none { task -> task.status == TaskStatus.Running } }
            val reads = weekReads()
            advanceTimeBy(60_000)
            runCurrent()

            assertEquals(TaskStatus.Done, card(state, "task-3").status)
            assertEquals(reads, weekReads())
        }

    @Test
    fun `it does not re-read while the screen is out of sight, and resumes when it comes back`() =
        runTest {
            serveWeek()
            val viewModel = newViewModel()
            viewModel.settled()
            val before = weekReads()

            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(before, weekReads())

            viewModel.setVisible(true)
            advanceTimeBy(3_000)
            runCurrent()
            awaitWeekReads(before + 1)

            viewModel.setVisible(false)
            val whenLeft = weekReads()
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(whenLeft, weekReads())
        }

    @Test
    fun `without an agent task open nothing is re-read`() =
        runTest {
            backend.route("GET", tasksPath, fixture("tasks-agenda-reference-doing"))
            val viewModel = newViewModel()
            viewModel.setVisible(true)
            viewModel.settled()

            advanceTimeBy(60_000)
            runCurrent()

            assertEquals(1, weekReads())
            assertFalse(
                viewModel.state.value.tasksByDay
                    .isEmpty(),
            )
        }

    @Test
    fun `a re-read that fails keeps the agenda and says nothing`() =
        runTest {
            var broken = false
            serveWeek { if (broken) status(503) else null }
            val viewModel = newViewModel()
            viewModel.setVisible(true)
            viewModel.settled()
            val before = weekReads()
            broken = true

            advanceTimeBy(3_000)
            runCurrent()
            awaitWeekReads(before + 1)
            withContext(Dispatchers.Default) { delay(100) }
            val state = viewModel.state.value

            assertEquals(AgendaLoad.Idle, state.load)
            assertNull(state.notice)
            assertEquals(TaskStatus.Running, card(state, "task-3").status)
        }
}
