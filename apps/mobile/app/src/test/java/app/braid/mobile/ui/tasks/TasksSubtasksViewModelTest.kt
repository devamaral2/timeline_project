package app.braid.mobile.ui.tasks

import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskGroupKey
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
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

/** A gaveta de subtarefas da lista de Tarefas, pela rede: o que vira linha, o que vai para a gaveta e o status por ela. */
@OptIn(ExperimentalCoroutinesApi::class)
class TasksSubtasksViewModelTest {
    private val now =
        Instant.parse(
            Fixtures
                .json("task-list-nesting")
                .jsonObject
                .getValue("now")
                .jsonPrimitive.content,
        )
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
        Thread.sleep(150)
        created.forEach { it.viewModelScope.cancel() }
        viewModes.close()
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(): TasksViewModel =
        TasksViewModel(
            DefaultTaskRepository(graph.apis.create(TasksApi::class.java)),
            viewModes.repository,
            AppClock { now },
        ).also(created::add)

    private suspend fun TasksViewModel.settled(): TasksUiState = state.first { it.cards != null || it.failed }

    private fun card(
        state: TasksUiState,
        id: String,
    ): TaskCard = state.cards.orEmpty().first { it.id == id }

    private fun groupIds(state: TasksUiState): Map<TaskGroupKey, List<String>> =
        state.groups.associate { group -> group.key to group.cards.map { it.id } }

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
    fun `a subtask whose parent is in the list leaves the groups and goes into the drawer`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-subtasks"))

            val state = newViewModel().settled()

            assertEquals(
                mapOf(
                    TaskGroupKey.Doing to listOf("trip"),
                    TaskGroupKey.Todo to listOf("orphan", "cyc-a", "cyc-b", "cyc-tail"),
                    TaskGroupKey.Waiting to listOf("self"),
                    TaskGroupKey.Done to listOf("closed-parent"),
                ),
                groupIds(state),
            )
            assertEquals(
                listOf("sub-1", "sub-2", "sub-3", "sub-7"),
                state.tree
                    .subtasksOf("trip")
                    .map { it.id }
                    .sorted(),
            )
            assertEquals(listOf("sub-4"), state.tree.subtasksOf("sub-2").map { it.id })
            assertEquals(listOf("sub-5", "sub-8"), state.tree.subtasksOf("sub-4").map { it.id })
        }

    @Test
    fun `the open count and the groups count rows only, not the subtasks`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-subtasks"))

            val state = newViewModel().settled()

            // Em curso 1 + A fazer 4 + Em espera 1; Feitas não conta, e as 8 subtarefas não são linha.
            assertEquals(6, state.openCount)
            assertEquals(15, state.cards!!.size)
        }

    @Test
    fun `drawers start open, nested ones too, and a toggle is per task`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-subtasks"))
            val viewModel = newViewModel()
            val state = viewModel.settled()

            assertTrue(state.isDrawerOpen("trip"))
            assertTrue(state.isDrawerOpen("sub-2"))
            assertTrue(state.isDrawerOpen("sub-4"))

            viewModel.toggleSubtasks("trip")
            assertFalse(viewModel.state.value.isDrawerOpen("trip"))
            assertTrue(viewModel.state.value.isDrawerOpen("sub-2"))

            viewModel.toggleSubtasks("sub-2")
            viewModel.toggleSubtasks("trip")
            // Reabrir a principal devolve a gaveta aninhada do jeito que ela estava: fechada.
            assertTrue(viewModel.state.value.isDrawerOpen("trip"))
            assertFalse(viewModel.state.value.isDrawerOpen("sub-2"))
            assertTrue(viewModel.state.value.isDrawerOpen("sub-4"))
        }

    @Test
    fun `the subtasks of a done parent stay in its drawer, in the collapsed group`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-subtasks"))
            val viewModel = newViewModel()
            val state = viewModel.settled()
            val done = state.groups.first { it.key == TaskGroupKey.Done }

            assertEquals(listOf("sub-6"), state.tree.subtasksOf("closed-parent").map { it.id })
            assertFalse(state.isExpanded(done))
            assertFalse("sub-6" in groupIds(state).values.flatten())
        }

    @Test
    fun `the glyph of a subtask of a person opens the picker and saves with its own revision`() =
        runTest {
            var saved = false
            backend.route("GET", listPath) { if (saved) fixture("task-list-subtasks-after-done") else fixture("task-list-subtasks") }
            backend.route("PATCH", "/api/tasks/sub-2") {
                saved = true
                MockResponse().setResponseCode(204)
            }
            val viewModel = newViewModel()
            val loaded = viewModel.settled()

            viewModel.openStatusPicker(card(loaded, "sub-2"))
            assertEquals(
                "sub-2",
                viewModel.state.value.statusPicker
                    ?.id,
            )
            viewModel.chooseStatus(TaskStatus.Done)
            val after = viewModel.state.first { card(it, "sub-2").status == TaskStatus.Done && !it.saving }

            val body = patchBody("/api/tasks/sub-2")
            assertEquals(3, body.getValue("expectedRevision").jsonPrimitive.int)
            assertEquals("done", body.getValue("status").jsonPrimitive.content)
            assertTrue(body.containsKey("finishedAt"))
            assertTrue(backend.requestsTo("PATCH", "/api/tasks/trip").isEmpty())
            assertEquals(4, card(after, "sub-2").revision)
            // A principal continua na mesma linha e a subtarefa continua na gaveta dela.
            assertEquals(listOf("trip"), groupIds(after).getValue(TaskGroupKey.Doing))
            assertTrue(after.tree.subtasksOf("trip").any { it.id == "sub-2" })
            assertNull(after.notice)
        }

    @Test
    fun `a nested subtask is changed with its own revision too`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-subtasks"))
            backend.route("PATCH", "/api/tasks/sub-4", MockResponse().setResponseCode(204))
            val viewModel = newViewModel()
            viewModel.openStatusPicker(card(viewModel.settled(), "sub-4"))

            viewModel.chooseStatus(TaskStatus.Doing)
            viewModel.state.first { !it.saving && backend.requestsTo("PATCH", "/api/tasks/sub-4").isNotEmpty() }

            val body = patchBody("/api/tasks/sub-4")
            assertEquals(2, body.getValue("expectedRevision").jsonPrimitive.int)
            assertEquals("doing", body.getValue("status").jsonPrimitive.content)
        }

    @Test
    fun `the glyph of an agent subtask does not open the picker`() =
        runTest {
            backend.route("GET", listPath, fixture("task-list-subtasks"))
            val viewModel = newViewModel()

            viewModel.openStatusPicker(card(viewModel.settled(), "sub-3"))

            assertNull(viewModel.state.value.statusPicker)
        }

    @Test
    fun `a stale revision on a subtask re-reads the list and warns`() =
        runTest {
            var conflicted = false
            backend.route("GET", listPath) {
                fixture(if (conflicted) "task-list-subtasks-after-conflict" else "task-list-subtasks")
            }
            backend.route("PATCH", "/api/tasks/sub-2") {
                conflicted = true
                MockResponse().setResponseCode(409).setBody("{}")
            }
            val viewModel = newViewModel()
            viewModel.openStatusPicker(card(viewModel.settled(), "sub-2"))

            viewModel.chooseStatus(TaskStatus.Done)
            val after = viewModel.state.first { card(it, "sub-2").status == TaskStatus.Cancel && it.notice != null && !it.saving }

            assertEquals(STALE_TASK_LIST_NOTICE, after.notice)
            assertEquals(9, card(after, "sub-2").revision)
        }

    @Test
    fun `without the parent in the list the subtask is a row again, by filter, by executor or by having no status`() =
        runTest {
            backend.route("GET", listPath) { request ->
                when {
                    request.requestUrl!!.queryParameter("actor") == "agent" -> fixture("task-list-subtasks-agents")
                    request.requestUrl!!.queryParameter("tag") != null -> fixture("task-list-subtasks-no-parent")
                    else -> fixture("task-list-subtasks")
                }
            }
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.toggleTag("viagem")
            val filtered = viewModel.state.first { it.tag == "viagem" && it.cards!!.none { c -> c.id == "trip" } }
            val rows = filtered.groups.flatMap { it.cards }.map { it.id }
            assertTrue("sub-2" in rows)
            assertTrue("sub-1" in rows)
            // A sub-4 continua dentro da sub-2, que agora é linha.
            assertEquals(listOf("sub-4"), filtered.tree.subtasksOf("sub-2").map { it.id })
            assertFalse("sub-4" in rows)

            viewModel.toggleTag("viagem")
            viewModel.state.first { it.tag == null && it.cards!!.any { c -> c.id == "trip" } }
            viewModes.repository.select(ViewMode.Agent)
            val agents = viewModel.state.first { it.viewMode == ViewMode.Agent && it.cards?.map { c -> c.id } == listOf("sub-3") }

            assertEquals(listOf("sub-3"), agents.groups.flatMap { it.cards }.map { it.id })
            assertEquals(1, agents.openCount)
        }
}
