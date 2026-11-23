package app.braid.mobile.ui.tasks

import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskGroupKey
import app.braid.mobile.domain.task.TaskPriority
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
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
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

/** A lista de Tarefas por status, pela rede: leitura, filtros, status pelo glifo e a releitura das tarefas de agente. */
@OptIn(ExperimentalCoroutinesApi::class)
class TasksViewModelTest {
    private val pipeline = Fixtures.json("task-list-pipeline").jsonObject
    private val patches = pipeline.getValue("patches").jsonObject
    private val now = Instant.parse(pipeline.getValue("now").jsonPrimitive.content)
    private val listPath = "/api/tasks/tracked"

    @get:Rule
    val folder = TemporaryFolder()

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private lateinit var viewModes: TestViewModes
    private val created = mutableListOf<TasksViewModel>()

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

    private fun newViewModel(at: Instant = now): TasksViewModel =
        TasksViewModel(
            DefaultTaskRepository(graph.apis.create(TasksApi::class.java)),
            viewModes.repository,
            AppClock { at },
        ).also(created::add)

    private suspend fun TasksViewModel.settled(): TasksUiState = state.first { it.cards != null || it.failed }

    private fun reads(): Int = backend.requestsTo("GET", listPath).size

    private fun lastRead() = backend.requestsTo("GET", listPath).last().requestUrl!!

    /** Espera o servidor de teste receber [count] leituras, em tempo real: a rede não anda no relógio virtual. */
    private suspend fun awaitReads(count: Int) =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) { while (reads() < count) delay(5) }
        }

    private fun card(
        state: TasksUiState,
        id: String,
    ): TaskCard = state.cards.orEmpty().first { it.id == id }

    private fun groupIds(state: TasksUiState): Map<TaskGroupKey, List<String>> =
        state.groups.associate { group ->
            group.key to
                group.cards.map { it.id }
        }

    private fun patchBody(path: String): JsonObject =
        Json
            .parseToJsonElement(
                backend
                    .requestsTo("PATCH", path)
                    .first()
                    .body
                    .clone()
                    .readUtf8(),
            ).jsonObject

    @Test
    fun `it reads the tracked list with no filter and groups it as the web does`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-all"))
            val viewModel = newViewModel()

            val state = viewModel.settled()

            val query = lastRead()
            assertEquals(setOf<String>(), query.queryParameterNames)
            assertEquals(
                mapOf(
                    TaskGroupKey.Doing to listOf("task-2", "task-3", "task-13"),
                    TaskGroupKey.Todo to listOf("task-1", "task-4", "series-a-2", "series-a-4"),
                    TaskGroupKey.ToDefine to listOf("task-6"),
                    TaskGroupKey.Waiting to listOf("task-5", "task-7", "series-c-2"),
                    TaskGroupKey.Done to listOf("task-8", "task-9", "series-b-2"),
                    TaskGroupKey.Closed to listOf("task-10", "task-11", "task-12"),
                ),
                groupIds(state),
            )
            assertEquals(false, state.failed)
            assertEquals(now, state.now)
        }

    @Test
    fun `a recurring series is one row, and the count is the rows of the groups that are not collapsed`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-all"))
            val state = newViewModel().settled()

            assertEquals(1, state.groups.flatMap { it.cards }.count { it.name == "Meditar" })
            assertEquals(1, state.groups.flatMap { it.cards }.count { it.name == "Academia" })
            // Em curso 3 + A fazer 4 + Sem data 1 + Em espera 3; Feitas e Encerradas não contam.
            assertEquals(11, state.openCount)
        }

    @Test
    fun `Feitas and Encerradas start collapsed and open on a tap`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-all"))
            val viewModel = newViewModel()
            val state = viewModel.settled()
            val done = state.groups.first { it.key == TaskGroupKey.Done }
            val doing = state.groups.first { it.key == TaskGroupKey.Doing }

            assertFalse(state.isExpanded(done))
            assertTrue(state.isExpanded(doing))
            viewModel.toggleGroup(TaskGroupKey.Done)
            assertTrue(viewModel.state.value.isExpanded(done))
            viewModel.toggleGroup(TaskGroupKey.Done)
            assertFalse(viewModel.state.value.isExpanded(done))
        }

    @Test
    fun `the executor choice goes as the actor filter and a change re-reads the list`() =
        runTest {
            backend.route("GET", listPath) { request ->
                when (request.requestUrl!!.queryParameter("actor")) {
                    "agent" -> fixture("task-list-agents")
                    "human" -> fixture("task-list-human")
                    else -> fixture("task-list-all")
                }
            }
            val viewModel = newViewModel()
            viewModel.settled()
            assertNull(lastRead().queryParameter("actor"))

            viewModes.repository.select(ViewMode.Agent)
            val agents =
                viewModel.state.first {
                    it.viewMode == ViewMode.Agent &&
                        it.cards?.all { card -> card.actor.code == "agent" } == true
                }

            assertEquals("agent", lastRead().queryParameter("actor"))
            assertTrue(agents.cards!!.isNotEmpty())
        }

    @Test
    fun `a tag, priorities and a search are query parameters, in the order the web sends them`() =
        runTest {
            backend.route("GET", listPath) { request ->
                if (request.requestUrl!!.queryParameterNames.isEmpty()) fixture("task-list-all") else fixture("task-list-contrato")
            }
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.toggleTag("trabalho")
            viewModel.togglePriority(TaskPriority.Low)
            viewModel.togglePriority(TaskPriority.Urgent)
            viewModel.search("  contrato ")
            advanceTimeBy(250)
            runCurrent()
            awaitReads(5)
            val filtered = viewModel.state.first { it.query == "contrato" && it.cards?.size == 1 }

            // As leituras saem em sequência mas chegam ao servidor em qualquer ordem (cada uma abre a sua conexão): a que
            // carrega a busca é a única com os três filtros, e o que ela manda vale, não qual chegou por último.
            val url =
                backend
                    .requestsTo("GET", listPath)
                    .map { it.requestUrl!! }
                    .single { it.queryParameter("q") == "contrato" }
            assertEquals("trabalho", url.queryParameter("tag"))
            assertEquals("urgent,low", url.queryParameter("priority"))
            assertEquals("contrato", url.queryParameter("q"))
            assertEquals(3, filtered.filters.count)
            assertEquals(listOf("task-2"), filtered.cards!!.map { it.id })
        }

    @Test
    fun `the search waits 250 ms after the last key and reads once`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-all"))
            val viewModel = newViewModel()
            viewModel.settled()
            val before = reads()

            viewModel.search("c")
            advanceTimeBy(200)
            viewModel.search("co")
            advanceTimeBy(200)
            runCurrent()
            assertEquals(before, reads())
            assertEquals("co", viewModel.state.value.typed)
            assertEquals("", viewModel.state.value.query)

            advanceTimeBy(50)
            runCurrent()
            awaitReads(before + 1)

            assertEquals("co", lastRead().queryParameter("q"))
        }

    @Test
    fun `the tags of the menu come from the unfiltered list and survive a filter`() =
        runTest {
            backend.route("GET", listPath) { request ->
                if (request.requestUrl!!.queryParameter("tag") == "trabalho") fixture("task-list-trabalho") else fixture("task-list-all")
            }
            val viewModel = newViewModel()
            val unfiltered = viewModel.settled()
            assertEquals(listOf("trabalho", "casa", "áurea", "saúde"), unfiltered.tags)
            assertEquals(3, unfiltered.tagCounts.getValue("trabalho"))

            viewModel.toggleTag("trabalho")
            val filtered = viewModel.state.first { it.tag == "trabalho" && it.cards?.size == 3 }

            assertEquals(listOf("trabalho", "casa", "áurea", "saúde"), filtered.tags)
            assertTrue(filtered.cards!!.all { it.tags.contains("trabalho") })
            // Escolher de novo a tag escolhida a desmarca e a lista inteira volta.
            viewModel.toggleTag("trabalho")
            val back = viewModel.state.first { it.tag == null && (it.cards?.size ?: 0) > 3 }
            assertNull(back.tag)
            assertNull(lastRead().queryParameter("tag"))
        }

    @Test
    fun `clearing the filters drops tag, priority and search but not the executor`() =
        runTest {
            backend.route("GET", listPath) { request ->
                if (request.requestUrl!!.queryParameter("actor") == "human") fixture("task-list-human") else fixture("task-list-all")
            }
            viewModes.repository.select(ViewMode.Human)
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.toggleTag("casa")
            viewModel.togglePriority(TaskPriority.High)
            viewModel.search("banco")
            advanceTimeBy(250)
            runCurrent()
            awaitReads(4)

            viewModel.clearFilters()
            val cleared = viewModel.state.first { it.filters.count == 0 && it.typed.isEmpty() }
            awaitReads(5)

            assertEquals(ViewMode.Human, cleared.viewMode)
            assertEquals("human", lastRead().queryParameter("actor"))
            assertEquals(setOf("actor"), lastRead().queryParameterNames)
        }

    @Test
    fun `an empty list with no filter offers the first task, and with a filter offers to clear it`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-empty"))
            val viewModel = newViewModel()
            val empty = viewModel.settled()

            assertTrue(empty.groups.isEmpty())
            assertFalse(empty.hasTasks)
            assertEquals(0, empty.filters.count)

            viewModel.toggleTag("casa")
            val filtered = viewModel.state.first { it.filters.count == 1 }
            assertTrue(filtered.groups.isEmpty())
            assertEquals(1, filtered.filters.count)
        }

    @Test
    fun `a failed read shows the error, and retrying reads again`() =
        runTest {
            backend.route("GET", listPath, status(500), fixture("task-list-all"))
            val viewModel = newViewModel()

            val failed = viewModel.settled()
            assertTrue(failed.failed)
            assertNull(failed.cards)

            viewModel.retry()
            val recovered = viewModel.state.first { it.cards != null }

            assertFalse(recovered.failed)
            assertEquals(2, reads())
        }

    @Test
    fun `the glyph of a person task opens the picker, whatever its status, and an agent task does not`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-all"))
            val viewModel = newViewModel()
            val state = viewModel.settled()

            viewModel.openStatusPicker(card(state, "task-8"))
            assertEquals(
                "task-8",
                viewModel.state.value.statusPicker
                    ?.id,
            )
            viewModel.dismissStatusPicker()
            assertNull(viewModel.state.value.statusPicker)
            viewModel.openStatusPicker(card(state, "task-1"))
            assertEquals(
                "task-1",
                viewModel.state.value.statusPicker
                    ?.id,
            )
            viewModel.dismissStatusPicker()

            viewModel.openStatusPicker(card(state, "task-3"))
            assertNull(viewModel.state.value.statusPicker)
            assertTrue(backend.requestsTo("PATCH", "/api/tasks/task-1").isEmpty())
        }

    @Test
    fun `choosing a status sends the revision that was read and the row changes group with the re-read`() =
        runTest {
            var saved = false
            backend.route("GET", listPath) { if (saved) fixture("task-list-after-doing") else fixture("task-list-all") }
            backend.route("PATCH", "/api/tasks/task-1") {
                saved = true
                MockResponse().setResponseCode(204)
            }
            val viewModel = newViewModel()
            viewModel.openStatusPicker(card(viewModel.settled(), "task-1"))

            viewModel.chooseStatus(TaskStatus.Doing)
            assertNull(viewModel.state.value.statusPicker)
            val after = viewModel.state.first { card(it, "task-1").status == TaskStatus.Doing && !it.saving }

            assertEquals(patches.getValue("doing").jsonObject, patchBody("/api/tasks/task-1"))
            assertEquals(4, card(after, "task-1").revision)
            assertEquals(setOf("task-1", "task-2", "task-3", "task-13"), groupIds(after).getValue(TaskGroupKey.Doing).toSet())
            assertFalse("task-1" in groupIds(after).getValue(TaskGroupKey.Todo))
            assertNull(after.notice)
        }

    @Test
    fun `finishing sends finishedAt with the current instant, and leaving done sends null`() =
        runTest {
            var saved = false
            backend.route("GET", listPath) { if (saved) fixture("task-list-after-done") else fixture("task-list-all") }
            backend.route("PATCH", "/api/tasks/task-1") {
                saved = true
                MockResponse().setResponseCode(204)
            }
            backend.route("PATCH", "/api/tasks/task-8", MockResponse().setResponseCode(204))
            val viewModel = newViewModel(at = Instant.parse(patches.getValue("now").jsonPrimitive.content))
            val loaded = viewModel.settled()

            viewModel.openStatusPicker(card(loaded, "task-1"))
            viewModel.chooseStatus(TaskStatus.Done)
            viewModel.state.first { card(it, "task-1").status == TaskStatus.Done && !it.saving }
            val finish = patchBody("/api/tasks/task-1")
            assertEquals("done", finish["status"]?.jsonPrimitive?.content)
            assertEquals("2026-09-14T15:30:45.123Z", finish["finishedAt"]?.jsonPrimitive?.content)

            viewModel.openStatusPicker(card(loaded, "task-8"))
            viewModel.chooseStatus(TaskStatus.Todo)
            viewModel.state.first { !it.saving && backend.requestsTo("PATCH", "/api/tasks/task-8").isNotEmpty() }
            assertEquals(patches.getValue("reopen").jsonObject, patchBody("/api/tasks/task-8"))
            assertTrue(patchBody("/api/tasks/task-8").containsKey("finishedAt"))
        }

    @Test
    fun `picking the status the task already has only closes the picker`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-all"))
            val viewModel = newViewModel()
            viewModel.openStatusPicker(card(viewModel.settled(), "task-1"))

            viewModel.chooseStatus(TaskStatus.Todo)

            assertNull(viewModel.state.value.statusPicker)
            assertTrue(backend.requestsTo("PATCH", "/api/tasks/task-1").isEmpty())
            assertEquals(1, reads())
        }

    @Test
    fun `a stale revision re-reads the list and warns`() =
        runTest {
            var conflicted = false
            backend.route("GET", listPath) { if (conflicted) fixture("task-list-after-conflict") else fixture("task-list-all") }
            backend.route("PATCH", "/api/tasks/task-1") {
                conflicted = true
                MockResponse().setResponseCode(409).setBody("{}")
            }
            val viewModel = newViewModel()
            viewModel.openStatusPicker(card(viewModel.settled(), "task-1"))

            viewModel.chooseStatus(TaskStatus.Doing)
            val after = viewModel.state.first { card(it, "task-1").status == TaskStatus.Cancel && it.notice != null && !it.saving }

            assertEquals("Esta tarefa mudou em outro lugar. Carregamos a lista atual; confira e tente de novo.", after.notice)
            assertEquals(9, card(after, "task-1").revision)
        }

    @Test
    fun `a refused change warns without re-reading, and the next pick clears the warning`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-all"))
            backend.route("PATCH", "/api/tasks/task-1", status(500), MockResponse().setResponseCode(204))
            val viewModel = newViewModel()
            viewModel.openStatusPicker(card(viewModel.settled(), "task-1"))

            viewModel.chooseStatus(TaskStatus.Cancel)
            val failed = viewModel.state.first { it.notice != null && !it.saving }

            assertEquals("Não foi possível trocar o status. Tente novamente.", failed.notice)
            assertEquals(1, reads())
            assertEquals(TaskStatus.Todo, card(failed, "task-1").status)

            viewModel.openStatusPicker(card(failed, "task-1"))
            viewModel.chooseStatus(TaskStatus.Cancel)
            assertNull(viewModel.state.value.notice)
        }

    @Test
    fun `with an agent task open the list re-reads every 3 seconds in silence, only while visible`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-all"))
            val viewModel = newViewModel()
            viewModel.settled()
            val before = reads()

            advanceTimeBy(60_000)
            runCurrent()
            assertEquals("not visible, no polling", before, reads())

            viewModel.setVisible(true)
            advanceTimeBy(2_999)
            runCurrent()
            assertEquals(before, reads())
            advanceTimeBy(1)
            runCurrent()
            awaitReads(before + 1)
            val state = viewModel.state.first { it.cards != null }

            assertFalse(state.failed)
            assertEquals(TaskStatus.Running, card(state, "task-3").status)

            viewModel.setVisible(false)
            val whenLeft = reads()
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(whenLeft, reads())
        }

    @Test
    fun `it stops re-reading when no agent task is left open`() =
        runTest {
            var finished = false
            backend.route("GET", listPath) { if (finished) fixture("task-list-agents-finished") else fixture("task-list-all") }
            val viewModel = newViewModel()
            viewModel.setVisible(true)
            viewModel.settled()
            finished = true

            advanceTimeBy(3_000)
            runCurrent()
            val state = viewModel.state.first { card(it, "task-3").status == TaskStatus.Done }
            val readsNow = reads()
            advanceTimeBy(60_000)
            runCurrent()

            assertEquals(TaskStatus.Done, card(state, "task-3").status)
            assertEquals(readsNow, reads())
        }

    @Test
    fun `a re-read that fails keeps the list and says nothing`() =
        runTest {
            var broken = false
            backend.route("GET", listPath) { if (broken) status(503) else fixture("task-list-all") }
            val viewModel = newViewModel()
            viewModel.setVisible(true)
            viewModel.settled()
            val before = reads()
            broken = true

            advanceTimeBy(3_000)
            runCurrent()
            awaitReads(before + 1)
            withContext(Dispatchers.Default) { delay(100) }
            val state = viewModel.state.value

            assertFalse(state.failed)
            assertNull(state.notice)
            assertEquals(TaskStatus.Running, card(state, "task-3").status)
        }
}
