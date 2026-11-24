package app.braid.mobile.ui.agenda

import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.agenda.AgendaRow
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.TestViewModes
import app.braid.mobile.support.awaitStored
import app.braid.mobile.support.stopAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant

/** A Agenda "Em sequência" e o tempo livre, pela fronteira de rede: o ViewModel real contra o servidor de teste. */
@OptIn(ExperimentalCoroutinesApi::class)
class AgendaSequenceViewModelTest {
    private val sequence = Fixtures.json("agenda-sequence").jsonObject
    private val anchor = sequence.getValue("anchor").jsonPrimitive.content
    private val windows = sequence.getValue("windows").jsonArray.map { it.jsonObject }
    private val freeTime = Fixtures.json("agenda-free-time").jsonObject
    private val tasksPath = "/api/tasks"

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

    private fun newViewModel(now: Instant = Instant.parse("2026-09-14T15:00:00.000Z")): AgendaViewModel =
        AgendaViewModel(
            DefaultTaskRepository(graph.apis.create(TasksApi::class.java)),
            viewModes.repository,
            viewModes.freeTime,
            AppClock { now },
        ).also(created::add)

    private suspend fun AgendaViewModel.settled(): AgendaUiState = state.first { it.load != AgendaLoad.Loading }

    private fun json(body: JsonElement) =
        MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body.toString())

    /** O servidor devolve a janela que a fixture traz para o par `from`/`to` pedido, e uma página vazia para qualquer outra. */
    private fun serveWindows(others: (from: String, to: String) -> MockResponse? = { _, _ -> null }) {
        backend.route("GET", tasksPath) { request ->
            val from = request.requestUrl!!.queryParameter("from")
            val to = request.requestUrl!!.queryParameter("to")
            val known = windows.firstOrNull { it.string("from") == from && it.string("to") == to }
            when {
                known != null -> json(known.getValue("response"))
                else -> others(from!!, to!!) ?: json(Fixtures.json("tasks-agenda-empty"))
            }
        }
    }

    private fun JsonObject.string(name: String) = getValue(name).jsonPrimitive.content

    private fun window(
        before: Int,
        after: Int,
    ) = windows.first { it.getValue("before").jsonPrimitive.int == before && it.getValue("after").jsonPrimitive.int == after }

    private fun idsByDay(window: JsonObject): Map<String, List<String>> =
        window.getValue("idsByDay").jsonObject.mapValues { (_, ids) -> ids.jsonArray.map { it.jsonPrimitive.content } }

    /** O que a janela atual mostra; dias lidos antes por outra janela (a semana de antes de trocar de modo) ficam guardados fora dela. */
    private fun AgendaUiState.idsByDay(): Map<String, List<String>> =
        windowDays.associateWith { day ->
            tasksByDay.getValue(day).map { it.id }
        }

    private fun lastRequestWindow(): Pair<String, String> =
        backend
            .requestsTo("GET", tasksPath)
            .last()
            .requestUrl!!
            .let { it.queryParameter("from")!! to it.queryParameter("to")!! }

    @Test
    fun `it opens by day, and the choice of view is not kept between runs, as in the web`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()
            assertEquals(AgendaMode.Day, viewModel.state.value.mode)

            viewModel.setMode(AgendaMode.Sequence)
            assertEquals(AgendaMode.Day, newViewModel().state.value.mode)
        }

    @Test
    fun `in sequence it reads the selected day and the seven after it, and shows what the web shows in each`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.setMode(AgendaMode.Sequence)
            val state = viewModel.settled()

            val first = window(0, 7)
            assertEquals(first.string("from") to first.string("to"), lastRequestWindow())
            assertEquals(AgendaMode.Sequence, state.mode)
            assertEquals(first.getValue("days").jsonArray.map { it.jsonPrimitive.content }, state.windowDays)
            assertEquals(idsByDay(first), state.idsByDay())
        }

    @Test
    fun `reaching the end reads seven more days after, keeping each day once even for a task that crosses midnight at the edge`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.setMode(AgendaMode.Sequence)
            viewModel.settled()

            viewModel.extend(AgendaEdge.Next)
            val state = viewModel.settled()

            val extended = window(0, 14)
            assertEquals(extended.string("from") to extended.string("to"), lastRequestWindow())
            assertEquals(idsByDay(extended), state.idsByDay())
            // "seq-8" começa no dia 21 e termina no 22: o dia 22 só chegou com a janela maior, e o 21 não a duplicou.
            assertEquals(listOf("seq-7", "seq-8"), state.idsByDay().getValue("2026-09-21"))
            assertEquals(listOf("seq-8", "seq-9"), state.idsByDay().getValue("2026-09-22"))
        }

    @Test
    fun `reaching the start reads seven more days before, and the day the anchor sits on gains the task that crossed into it`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.setMode(AgendaMode.Sequence)
            viewModel.settled()

            viewModel.extend(AgendaEdge.Previous)
            val state = viewModel.settled()

            val extended = window(7, 7)
            assertEquals(extended.string("from") to extended.string("to"), lastRequestWindow())
            assertEquals(idsByDay(extended), state.idsByDay())
            assertEquals(listOf("seq-3", "seq-4", "seq-5"), state.idsByDay().getValue(anchor))
            assertEquals(anchor, state.anchorDay)
        }

    @Test
    fun `growing on both sides keeps the days already read and merges the new window by day`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.setMode(AgendaMode.Sequence)
            viewModel.settled()

            viewModel.extend(AgendaEdge.Next)
            viewModel.settled()
            viewModel.extend(AgendaEdge.Previous)
            val state = viewModel.settled()

            assertEquals(idsByDay(window(7, 14)), state.idsByDay())
        }

    @Test
    fun `each side stops growing at 364 days`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.setMode(AgendaMode.Sequence)
            viewModel.settled()

            repeat(52) {
                viewModel.extend(AgendaEdge.Next)
                viewModel.settled()
            }
            val reads = backend.requestsTo("GET", tasksPath).size
            viewModel.extend(AgendaEdge.Next)
            viewModel.settled()
            assertEquals("no read past 364 days after", reads, backend.requestsTo("GET", tasksPath).size)
            assertEquals(sequence.getValue("cap").jsonObject.string("lastTo"), lastRequestWindow().second)

            repeat(52) {
                viewModel.extend(AgendaEdge.Previous)
                viewModel.settled()
            }
            val total = backend.requestsTo("GET", tasksPath).size
            viewModel.extend(AgendaEdge.Previous)
            viewModel.settled()
            assertEquals("no read past 364 days before", total, backend.requestsTo("GET", tasksPath).size)
            assertEquals(sequence.getValue("cap").jsonObject.string("firstFrom"), lastRequestWindow().first)
            assertEquals(364 * 2 + 1, viewModel.state.value.windowDays.size)
        }

    @Test
    fun `reading while a window is still arriving does not ask for another one`() =
        runTest {
            val gate = java.util.concurrent.CountDownLatch(1)
            serveWindows { _, _ ->
                gate.await(5, java.util.concurrent.TimeUnit.SECONDS)
                null
            }
            val viewModel = newViewModel()
            viewModel.setMode(AgendaMode.Sequence)
            assertEquals(AgendaLoad.Loading, viewModel.state.value.load)

            viewModel.extend(AgendaEdge.Next)

            assertEquals(7, viewModel.state.value.after)
            gate.countDown()
        }

    @Test
    fun `the day on screen follows the reading without reading again, and going back to day mode opens its week`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.setMode(AgendaMode.Sequence)
            viewModel.settled()
            val reads = backend.requestsTo("GET", tasksPath).size

            viewModel.showVisibleDay("2026-09-21")

            assertEquals("2026-09-21", viewModel.state.value.selectedDay)
            assertEquals(anchor, viewModel.state.value.anchorDay)
            assertEquals(reads, backend.requestsTo("GET", tasksPath).size)

            viewModel.setMode(AgendaMode.Day)
            viewModel.settled()
            // A semana do dia 21 (uma segunda-feira) começa no domingo 20, à meia-noite de São Paulo.
            assertEquals("2026-09-20T03:00:00.000Z", lastRequestWindow().first)
            assertEquals("2026-09-21", viewModel.state.value.selectedDay)
        }

    @Test
    fun `picking a day in sequence starts the window over from it`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.setMode(AgendaMode.Sequence)
            viewModel.settled()
            viewModel.extend(AgendaEdge.Next)
            viewModel.settled()

            viewModel.selectDay("2026-10-05")
            val state = viewModel.settled()

            assertEquals("2026-10-05", state.anchorDay)
            assertEquals(0, state.before)
            assertEquals(7, state.after)
            assertEquals(8, state.windowDays.size)
            assertEquals("2026-10-05", state.windowDays.first())
        }

    @Test
    fun `free time is off until the person turns it on, and the choice survives closing the app`() =
        runTest {
            serveWindows()
            val viewModel = newViewModel()
            viewModel.settled()
            assertFalse(viewModel.state.value.showFreeTime)

            viewModel.setFreeTime(true)
            assertTrue(viewModel.state.value.showFreeTime)

            assertTrue(viewModes.freeTime.enabled.awaitStored { it })
            val reopened = newViewModel()
            // Tempo real, não o virtual do `runTest`: a tela reaberta lê o DataStore do disco, e o relógio virtual
            // esgota os 5 s na hora, antes de a leitura chegar.
            val restored = withContext(Dispatchers.Default) { withTimeout(30_000) { reopened.state.first { it.showFreeTime } } }
            assertTrue(restored.showFreeTime)
        }

    private fun serveFreeDay() {
        backend.route("GET", tasksPath) { json(freeTime.getValue("page")) }
    }

    private fun freeDay() = freeTime.getValue("day").jsonPrimitive.content

    private fun rowsAsFixture(rows: List<AgendaRow>) =
        rows.map { row ->
            when (row) {
                is AgendaRow.Task -> listOf("task", row.card.id, row.startMs)
                is AgendaRow.Free -> listOf("free", row.slot.startMs, row.slot.endMs, row.slot.minutes, row.slot.endsAtMidnight)
            }
        }

    private fun expectedRows(name: String) =
        freeTime.getValue(name).jsonArray.map { element ->
            val row = element.jsonObject
            if (row.string("kind") == "task") {
                listOf("task", row.string("id"), row.getValue("startMs").jsonPrimitive.long)
            } else {
                listOf(
                    "free",
                    row.getValue("startMs").jsonPrimitive.long,
                    row.getValue("endMs").jsonPrimitive.long,
                    row.getValue("minutes").jsonPrimitive.int,
                    row.getValue("endsAtMidnight").jsonPrimitive.boolean,
                )
            }
        }

    @Test
    fun `a day lists its tasks and the free windows of 15 minutes or more between person tasks, in clock order`() =
        runTest {
            serveFreeDay()
            val viewModel = newViewModel(Instant.parse("2026-09-16T12:00:00.000Z"))
            viewModel.selectDay(freeDay())
            viewModel.setFreeTime(true)
            val state = viewModel.settled()

            assertEquals(expectedRows("rowsWithFreeTime"), rowsAsFixture(state.rowsOn(freeDay())!!))
        }

    @Test
    fun `with free time off, or while searching, the day lists only its tasks`() =
        runTest {
            serveFreeDay()
            val viewModel = newViewModel(Instant.parse("2026-09-16T12:00:00.000Z"))
            viewModel.selectDay(freeDay())
            viewModel.settled()

            viewModel.setFreeTime(false)
            assertEquals(expectedRows("rowsWithoutFreeTime"), rowsAsFixture(viewModel.state.value.rowsOn(freeDay())!!))

            viewModel.setFreeTime(true)
            viewModel.search("primeira")
            assertTrue(
                viewModel.state.value
                    .rowsOn(freeDay())!!
                    .all { it is AgendaRow.Task },
            )
        }

    @Test
    fun `a free window carries what the chat needs to plan it`() =
        runTest {
            serveFreeDay()
            val viewModel = newViewModel(Instant.parse("2026-09-16T12:00:00.000Z"))
            viewModel.selectDay(freeDay())
            viewModel.setFreeTime(true)
            val state = viewModel.settled()

            val free = state.rowsOn(freeDay())!!.filterIsInstance<AgendaRow.Free>().first()
            val window = free.window(freeDay())

            assertEquals(freeDay(), window.dayKey)
            assertEquals(free.slot.startMs, window.startMs)
            assertEquals(free.slot.endMs, window.endMs)
            assertEquals(free.slot.minutes, window.minutes)
            assertEquals(free.slot.endsAtMidnight, window.endsAtMidnight)
        }
}
