package app.braid.mobile.ui.taskedit

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.requests.DefaultAgentRequestRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.DefaultTaskEditRepository
import app.braid.mobile.data.tasks.DefaultTaskPickerRepository
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.tasks.TaskEditApi
import app.braid.mobile.data.tasks.TaskPickerApi
import app.braid.mobile.domain.task.HierarchySlot
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.ui.picker.PickerSearchStatus
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** A hierarquia na edição pela rede: o seletor de tarefas, "Criar", "Pedir ao Hermes" e o que o Salvar manda. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskHierarchyViewModelTest {
    private val now = Instant.parse("2026-09-14T15:30:45.123Z")
    private val trackedPath = "/api/tasks/tracked"
    private val requestPath = "/api/requests/req-hermes"
    private val tasks: JsonObject = Fixtures.json("task-hierarchy-tasks").jsonObject

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        graph.storage.session = StoredSession("access", "refresh", userId = "user-7", email = "a@b.c", name = "Ana")
        for (task in tasks.values) {
            val id =
                task.jsonObject
                    .getValue("id")
                    .jsonPrimitive.content
            backend.route("GET", "/api/tasks/$id", json(task.toString()))
        }
        backend.route("GET", trackedPath, fixture("task-hierarchy-tracked"))
    }

    @After
    fun tearDown() {
        Thread.sleep(100)
        backend.close()
        Dispatchers.resetMain()
    }

    private fun json(text: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(text)

    private suspend fun newViewModel(taskId: String = "task-open"): TaskEditViewModel {
        graph.sessionRepository.restore()
        val detail = graph.apis.create(TaskDetailApi::class.java)
        return TaskEditViewModel(
            SavedStateHandle(mapOf("taskId" to taskId)),
            DefaultTaskDetailRepository(detail),
            DefaultTaskEditRepository(graph.apis.create(TaskEditApi::class.java), detail),
            AppClock { now },
            DefaultTaskPickerRepository(graph.apis.create(TaskPickerApi::class.java)),
            DefaultAgentRequestRepository(graph.apis.create(RequestsApi::class.java)),
            graph.sessionRepository,
        )
    }

    private suspend fun TaskEditViewModel.opened(): TaskEditViewModel {
        state.first { it is TaskEditUiState.Form }
        return this
    }

    private val TaskEditViewModel.draft get() = (state.value as TaskEditUiState.Form).draft

    private suspend fun TaskEditViewModel.picker(): TaskPicker =
        hierarchy.state
            .first {
                it.picker?.search?.status ==
                    PickerSearchStatus.Ready
            }.picker!!

    private fun names(picker: TaskPicker) = picker.search.results.map { it.id }

    private fun body(request: RecordedRequest): JsonObject = Json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject

    private fun serveCreate() {
        backend.route("POST", "/api/tasks", fixture("task-hierarchy-created", 201))
    }

    @Test
    fun `the linked tasks are read by id, the main one first`() =
        runTest {
            val viewModel = newViewModel().opened()

            val state = viewModel.hierarchy.state.first { it.cards.size == 3 }

            assertEquals(setOf("task-parent", "task-sub-1", "task-sub-2"), state.cards.keys)
            assertEquals("Viagem de setembro", state.cards.getValue("task-parent").name)
            assertFalse(state.loadFailed)
            assertEquals(1, backend.requestsTo("GET", "/api/tasks/task-parent").size)
        }

    @Test
    fun `a linked task that does not load lights the failure`() =
        runTest {
            backend.route("GET", "/api/tasks/task-sub-2", status(404))
            val viewModel = newViewModel().opened()

            val state = viewModel.hierarchy.state.first { it.loadFailed && "task-sub-1" in it.cards && "task-parent" in it.cards }

            assertTrue("task-sub-2" !in state.cards)
        }

    @Test
    fun `the picker opens with the first 50 tasks and leaves out the open task, the subtasks and the chosen main task`() =
        runTest {
            val viewModel = newViewModel().opened()

            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            val subtasks = viewModel.picker()

            assertEquals(listOf("task-parent-2", "task-agent", "task-lone"), names(subtasks))
            val request = backend.requestsTo("GET", trackedPath).single()
            assertEquals("50", request.requestUrl?.queryParameter("limit"))
            assertNull(request.requestUrl?.queryParameter("q"))
            assertNull(request.requestUrl?.queryParameter("actor"))

            viewModel.hierarchy.open(HierarchySlot.Parent)
            val parent = viewModel.picker()
            assertEquals(listOf("task-parent", "task-parent-2", "task-agent", "task-lone"), names(parent))
        }

    @Test
    fun `typing waits for the pause, then searches by the trimmed text`() =
        runTest {
            backend.route("GET", trackedPath, fixture("task-hierarchy-tracked"), fixture("task-hierarchy-tracked-filtered"))
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()

            viewModel.hierarchy.type("h")
            viewModel.hierarchy.type("  proj ")
            val found =
                viewModel.hierarchy.state.first {
                    it.picker?.search?.query == "proj" &&
                        it.picker?.search?.status == PickerSearchStatus.Ready
                }

            assertEquals("  proj ", found.picker?.search?.typed)
            assertEquals(
                listOf("task-parent-2"),
                found.picker
                    ?.search
                    ?.results
                    ?.map { it.id },
            )
            val searches = backend.requestsTo("GET", trackedPath)
            assertEquals(2, searches.size)
            assertEquals("proj", searches.last().requestUrl?.queryParameter("q"))
        }

    @Test
    fun `a search that fails says so and keeps the field`() =
        runTest {
            backend.route("GET", trackedPath, status(500))
            val viewModel = newViewModel().opened()

            viewModel.hierarchy.open(HierarchySlot.Parent)
            val failed = viewModel.hierarchy.state.first { it.picker?.search?.status == PickerSearchStatus.Failed }

            assertTrue(
                failed.picker
                    ?.search
                    ?.results
                    ?.isEmpty() == true,
            )
        }

    @Test
    fun `choosing a result makes it the main task and closes the sheet`() =
        runTest {
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.removeParent()
            assertNull(viewModel.draft.parentTaskId)

            viewModel.hierarchy.open(HierarchySlot.Parent)
            val card =
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "task-parent-2" }
            viewModel.hierarchy.pick(card)

            assertEquals("task-parent-2", viewModel.draft.parentTaskId)
            assertNull(viewModel.hierarchy.state.value.picker)
            assertEquals(
                "Projeto do trimestre",
                viewModel.hierarchy.state.value.cards
                    .getValue("task-parent-2")
                    .name,
            )
        }

    @Test
    fun `choosing a subtask appends it and removing one drops only that id`() =
        runTest {
            val viewModel = newViewModel().opened()

            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.hierarchy.pick(
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "task-lone" },
            )
            assertEquals(listOf("task-sub-1", "task-sub-2", "task-lone"), viewModel.draft.subtaskIds)

            viewModel.hierarchy.removeSubtask("task-sub-1")
            assertEquals(listOf("task-sub-2", "task-lone"), viewModel.draft.subtaskIds)
            assertEquals("task-parent", viewModel.draft.parentTaskId)
        }

    @Test
    fun `create sends the task with its name only, once, and links it to the draft without saving`() =
        runTest {
            serveCreate()
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()

            viewModel.hierarchy.type("  Alugar um carro ")
            viewModel.hierarchy.create()
            viewModel.hierarchy.state.first { it.picker == null }

            val request = backend.requestsTo("POST", "/api/tasks").single()
            assertEquals(Json.parseToJsonElement(Fixtures.text("task-hierarchy-create-body")).jsonObject, body(request))
            assertTrue(request.getHeader("Idempotency-Key").orEmpty().isNotEmpty())
            assertEquals(listOf("task-sub-1", "task-sub-2", "task-created"), viewModel.draft.subtaskIds)
            assertEquals(
                "Alugar um carro",
                viewModel.hierarchy.state.value.cards
                    .getValue("task-created")
                    .name,
            )
            assertEquals(0, backend.requestsTo("PATCH", "/api/tasks/task-open").size)
        }

    @Test
    fun `a failed create keeps the sheet, says so, and a retry of the same name reuses the key`() =
        runTest {
            var calls = 0
            backend.route("POST", "/api/tasks") { if (++calls == 1) status(500) else fixture("task-hierarchy-created", 201) }
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()
            viewModel.hierarchy.type("Alugar um carro")

            viewModel.hierarchy.create()
            val failed = viewModel.hierarchy.state.first { it.picker?.footer is PickerFooter.Failed }
            assertEquals(PickerFooter.Failed(TASK_CREATE_FAILED), failed.picker?.footer)
            assertEquals(listOf("task-sub-1", "task-sub-2"), viewModel.draft.subtaskIds)

            viewModel.hierarchy.create()
            viewModel.hierarchy.state.first { it.picker == null }
            val keys = backend.requestsTo("POST", "/api/tasks").map { it.getHeader("Idempotency-Key") }
            assertEquals(2, keys.size)
            assertEquals(keys[0], keys[1])

            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()
            viewModel.hierarchy.type("Outro nome")
            viewModel.hierarchy.create()
            viewModel.hierarchy.state.first { it.picker == null }
            val third = backend.requestsTo("POST", "/api/tasks").last().getHeader("Idempotency-Key")
            assertNotEquals(keys[0], third)
        }

    @Test
    fun `create and ask do nothing while the field is empty`() =
        runTest {
            serveCreate()
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()

            viewModel.hierarchy.type("   ")
            viewModel.hierarchy.create()
            viewModel.hierarchy.askHermes()

            assertEquals(0, backend.requestsTo("POST", "/api/tasks").size)
            assertEquals(0, backend.requestsTo("POST", "/api/requests").size)
            assertEquals(
                PickerFooter.Idle,
                viewModel.hierarchy.state.value.picker
                    ?.footer,
            )
        }

    private fun serveHermes(vararg responses: String) {
        backend.route("POST", "/api/requests", fixture("task-hierarchy-request-accepted", 202))
        backend.route("GET", requestPath, *responses.map { fixture(it) }.toTypedArray())
    }

    @Test
    fun `asking Hermes sends the text, follows the request, and links only the top tasks it created`() =
        runTest {
            serveHermes(
                "task-hierarchy-request-queued",
                "task-hierarchy-request-running",
                "task-hierarchy-request-running-step",
                "task-hierarchy-request-done",
            )
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()
            val seen = mutableListOf<PickerFooter?>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler), start = CoroutineStart.UNDISPATCHED) {
                viewModel.hierarchy.state.collect { seen += it.picker?.footer }
            }

            viewModel.hierarchy.type("Preparar a mala")
            viewModel.hierarchy.askHermes()
            viewModel.hierarchy.state.first { it.picker == null }

            val start = body(backend.requestsTo("POST", "/api/requests").single())
            assertEquals(setOf("userId", "text", "clientMessageId"), start.keys)
            assertEquals("user-7", start.getValue("userId").jsonPrimitive.content)
            assertEquals("Preparar a mala", start.getValue("text").jsonPrimitive.content)
            assertTrue(
                start
                    .getValue("clientMessageId")
                    .jsonPrimitive.content
                    .isNotEmpty(),
            )
            assertEquals(4, backend.requestsTo("GET", requestPath).size)
            val asking = seen.filterIsInstance<PickerFooter.Asking>().map { it.progress }.distinct()
            assertEquals(listOf(null, "Criando as tarefas…", "Montar as tarefas"), asking)
            // h2 é subtarefa de h1, criada junto: fica onde o pedido a pôs.
            assertEquals(listOf("task-sub-1", "task-sub-2", "task-h1", "task-h3"), viewModel.draft.subtaskIds)
            assertTrue("task-h2" !in viewModel.draft.subtaskIds)
        }

    @Test
    fun `for the main task only the first task Hermes created is used`() =
        runTest {
            serveHermes("task-hierarchy-request-done")
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.removeParent()
            viewModel.hierarchy.open(HierarchySlot.Parent)
            viewModel.picker()

            viewModel.hierarchy.type("Preparar a mala")
            viewModel.hierarchy.askHermes()
            viewModel.hierarchy.state.first { it.picker == null }

            assertEquals("task-h1", viewModel.draft.parentTaskId)
            assertEquals(listOf("task-sub-1", "task-sub-2"), viewModel.draft.subtaskIds)
        }

    @Test
    fun `a failed request shows its message, or the generic one, and links nothing`() =
        runTest {
            serveHermes("task-hierarchy-request-failed")
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()
            viewModel.hierarchy.type("Preparar a mala")

            viewModel.hierarchy.askHermes()
            val failed = viewModel.hierarchy.state.first { it.picker?.footer is PickerFooter.Failed }
            assertEquals(PickerFooter.Failed("O Hermes está fora do ar."), failed.picker?.footer)

            serveHermes("task-hierarchy-request-failed-bare")
            viewModel.hierarchy.askHermes()
            viewModel.hierarchy.state.first { it.picker?.footer == PickerFooter.Failed(HERMES_ASK_FAILED) }
            assertEquals(listOf("task-sub-1", "task-sub-2"), viewModel.draft.subtaskIds)
        }

    @Test
    fun `a request that creates no task says so, with its own message when it has one`() =
        runTest {
            serveHermes("task-hierarchy-request-done-nothing")
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()
            viewModel.hierarchy.type("Preparar a mala")

            viewModel.hierarchy.askHermes()
            viewModel.hierarchy.state.first { it.picker?.footer == PickerFooter.Failed("Não encontrei o que criar.") }

            serveHermes("task-hierarchy-request-done-nothing-bare")
            viewModel.hierarchy.askHermes()
            viewModel.hierarchy.state.first { it.picker?.footer == PickerFooter.Failed(HERMES_NOTHING_CREATED) }
        }

    @Test
    fun `a request refused by the API says the generic failure`() =
        runTest {
            backend.route("POST", "/api/requests", status(500))
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()
            viewModel.hierarchy.type("Preparar a mala")

            viewModel.hierarchy.askHermes()

            viewModel.hierarchy.state.first { it.picker?.footer == PickerFooter.Failed(HERMES_ASK_FAILED) }
        }

    @Test
    fun `closing the sheet while Hermes works links nothing and stops asking`() =
        runTest {
            serveHermes("task-hierarchy-request-running")
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.picker()
            viewModel.hierarchy.type("Preparar a mala")
            viewModel.hierarchy.askHermes()
            viewModel.hierarchy.state.first { it.picker?.footer is PickerFooter.Asking }

            viewModel.hierarchy.close()
            val reads = backend.requestsTo("GET", requestPath).size
            serveHermes("task-hierarchy-request-done")
            testScheduler.advanceTimeBy(60_000)
            testScheduler.runCurrent()
            Thread.sleep(150)

            assertEquals(reads, backend.requestsTo("GET", requestPath).size)
            assertEquals(listOf("task-sub-1", "task-sub-2"), viewModel.draft.subtaskIds)
            assertNull(viewModel.hierarchy.state.value.picker)
        }

    @Test
    fun `save sends only the parent and the whole subtask list, with the revision that was read`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-open", MockResponse().setResponseCode(204))
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.removeParent()
            viewModel.hierarchy.removeSubtask("task-sub-1")
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.hierarchy.pick(
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "task-lone" },
            )

            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            val patch = body(backend.requestsTo("PATCH", "/api/tasks/task-open").single())
            assertEquals(setOf("expectedRevision", "parentTaskId", "subtaskIds"), patch.keys)
            assertEquals(JsonNull, patch.getValue("parentTaskId"))
            assertEquals(
                listOf("task-sub-2", "task-lone"),
                (patch.getValue("subtaskIds") as kotlinx.serialization.json.JsonArray).map {
                    it.jsonPrimitive.content
                },
            )
            assertEquals("3", patch.getValue("expectedRevision").jsonPrimitive.content)
        }

    @Test
    fun `putting the task under another main task sends the new id and nothing else`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-open", MockResponse().setResponseCode(204))
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.removeParent()
            viewModel.hierarchy.open(HierarchySlot.Parent)
            viewModel.hierarchy.pick(
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "task-parent-2" },
            )

            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            val patch = body(backend.requestsTo("PATCH", "/api/tasks/task-open").single())
            assertEquals(setOf("expectedRevision", "parentTaskId"), patch.keys)
            assertEquals("task-parent-2", patch.getValue("parentTaskId").jsonPrimitive.content)
        }

    @Test
    fun `saving without touching the hierarchy sends no hierarchy fields`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-open", MockResponse().setResponseCode(204))
            val viewModel = newViewModel().opened()
            viewModel.update { it.copy(name = "Planejar a viagem toda") }

            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            val patch = body(backend.requestsTo("PATCH", "/api/tasks/task-open").single())
            assertEquals(setOf("expectedRevision", "name"), patch.keys)
        }

    @Test
    fun `a cycle refused by the API keeps the choice and shows the message`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-open", status(400))
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.open(HierarchySlot.Subtasks)
            viewModel.hierarchy.pick(
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "task-lone" },
            )

            viewModel.save()
            val form = viewModel.state.first { (it as TaskEditUiState.Form).failure != null } as TaskEditUiState.Form

            assertEquals(REFUSED_FORM_NOTICE, form.failure)
            assertFalse(form.saving)
            assertEquals(listOf("task-sub-1", "task-sub-2", "task-lone"), form.draft.subtaskIds)
            assertEquals("task-parent", form.draft.parentTaskId)
        }

    @Test
    fun `a stale revision keeps the hierarchy that was chosen`() =
        runTest {
            var calls = 0
            backend.route("PATCH", "/api/tasks/task-open") { if (++calls == 1) status(409) else MockResponse().setResponseCode(204) }
            val viewModel = newViewModel().opened()
            viewModel.hierarchy.removeParent()

            viewModel.save()
            val form = viewModel.state.first { (it as TaskEditUiState.Form).failure == STALE_FORM_NOTICE } as TaskEditUiState.Form

            assertNull(form.draft.parentTaskId)
        }
}
