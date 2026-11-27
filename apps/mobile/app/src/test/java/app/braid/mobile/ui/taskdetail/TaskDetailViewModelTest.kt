package app.braid.mobile.ui.taskdetail

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.transcription.DefaultTranscriptionRepository
import app.braid.mobile.data.transcription.TranscriptionApi
import app.braid.mobile.domain.task.RequestRelation
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.RequestGate
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.stopAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
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
import org.junit.Test
import java.time.Instant

/** O detalhe da tarefa de pessoa pela rede: leitura, troca de status e de prioridade, hierarquia, pedidos e exclusão. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskDetailViewModelTest {
    private val change = Fixtures.json("tasks-status-change").jsonObject
    private val changeNow = Instant.parse(change.getValue("now").jsonPrimitive.content)
    private val taskPath = "/api/tasks/task-1"

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
    }

    private val created = mutableListOf<TaskDetailViewModel>()

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(
        id: String = "task-1",
        now: Instant = changeNow,
    ): TaskDetailViewModel =
        TaskDetailViewModel(
            SavedStateHandle(mapOf("taskId" to id)),
            DefaultTaskDetailRepository(graph.apis.create(TaskDetailApi::class.java)),
            AppClock { now },
            DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)),
            DefaultTranscriptionRepository(graph.apis.create(TranscriptionApi::class.java)),
        ).also(created::add)

    private suspend fun TaskDetailViewModel.content(): TaskDetailUiState.Content =
        state.first {
            it is TaskDetailUiState.Content
        } as TaskDetailUiState.Content

    /** O conteúdo de uma releitura que já trouxe [status], e não o que a tela lia antes. */
    private suspend fun TaskDetailViewModel.contentWith(status: TaskStatus): TaskDetailUiState.Content =
        state.first { it is TaskDetailUiState.Content && it.task.status == status && !it.saving } as TaskDetailUiState.Content

    private fun noContent(): MockResponse = MockResponse().setResponseCode(204)

    private fun serveHierarchy() {
        backend.route("GET", "/api/tasks/task-parent", fixture("task-detail-parent"))
        backend.route("GET", "/api/tasks/task-sub-1", fixture("task-detail-sub-1"))
        backend.route("GET", "/api/tasks/task-sub-2", fixture("task-detail-sub-2"))
    }

    private fun patchBody(): JsonObject =
        Json
            .parseToJsonElement(
                backend
                    .requestsTo("PATCH", taskPath)
                    .single()
                    .body
                    .clone()
                    .readUtf8(),
            ).jsonObject

    /** O corpo que o web manda ao trocar o status de [from] para [to] (revisão 4), gerado por `statusPatch`. */
    private fun expectedStatusPatch(
        from: String,
        to: String,
    ): JsonObject =
        (change.getValue("patches") as JsonArray)
            .map { it.jsonObject }
            .first { it.getValue("from").jsonPrimitive.content == from && it.getValue("to").jsonPrimitive.content == to }
            .getValue("patch")
            .jsonObject

    @Test
    fun `reload reads the task again, so the detail shows what the edit form saved`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"), fixture("task-detail-reloaded-doing"))
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.reload()

            assertEquals(TaskStatus.Doing, viewModel.contentWith(TaskStatus.Doing).task.status)
            assertEquals(2, backend.requestsTo("GET", taskPath).size)
        }

    @Test
    fun `it reads the task and shows what the detail lists`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            serveHierarchy()

            val content = newViewModel().content()

            assertEquals(1, backend.requestsTo("GET", taskPath).size)
            assertEquals("Reunião de planejamento", content.task.card.name)
            assertEquals(TaskStatus.Todo, content.task.status)
            assertEquals(TaskPriority.High, content.task.priority)
            assertEquals(4, content.task.card.revision)
            assertEquals("Rua Augusta, 100 - São Paulo", content.task.location)
            assertEquals(listOf(30, 1440, 2880), content.task.notifyOffsetsMinutes)
            assertTrue(content.task.hasHumanControls)
        }

    @Test
    fun `a missing or foreign task says it was not found, and any other failure offers a retry`() =
        runTest {
            backend.route("GET", taskPath, status(404))
            assertEquals(TaskDetailUiState.Missing, newViewModel().state.first { it !is TaskDetailUiState.Loading })

            backend.route("GET", taskPath, status(403))
            assertEquals(TaskDetailUiState.Missing, newViewModel().state.first { it !is TaskDetailUiState.Loading })

            backend.route("GET", taskPath, status(500), fixture("task-detail-minimal"))
            val viewModel = newViewModel()
            assertEquals(TaskDetailUiState.Failed, viewModel.state.first { it !is TaskDetailUiState.Loading })
        }

    @Test
    fun `retry reads the task again`() =
        runTest {
            backend.route("GET", taskPath, status(500), fixture("task-detail-person"))
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.state.first { it == TaskDetailUiState.Failed }

            viewModel.retry()

            assertEquals(
                "Reunião de planejamento",
                viewModel
                    .content()
                    .task.card.name,
            )
        }

    @Test
    fun `the reference task has no status nor priority to change`() =
        runTest {
            backend.route("GET", "/api/tasks/task-9", fixture("task-detail-reference"))
            val viewModel = newViewModel("task-9")
            val content = viewModel.content()

            viewModel.changeStatus(TaskStatus.Done)
            viewModel.changePriority(TaskPriority.Urgent)

            assertNull(content.task.status)
            assertFalse(content.task.hasHumanControls)
            assertTrue(backend.requestsTo("PATCH", "/api/tasks/task-9").isEmpty())
        }

    @Test
    fun `an agent task opens the same destination without person controls`() =
        runTest {
            backend.route("GET", "/api/tasks/task-agent", fixture("task-detail-agent"))
            val content = newViewModel("task-agent").content()

            assertEquals(TaskActor.Agent, content.task.actor)
            assertFalse(content.task.hasHumanControls)
        }

    @Test
    fun `changing the status sends the revision that was read and shows the re-read task`() =
        runTest {
            var saved = false
            backend.route("GET", taskPath) { if (saved) fixture("task-detail-reloaded-doing") else fixture("task-detail-person") }
            backend.route("PATCH", taskPath) {
                saved = true
                MockResponse().setResponseCode(204)
            }
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.changeStatus(TaskStatus.Doing)
            val after = viewModel.contentWith(TaskStatus.Doing)

            assertEquals(expectedStatusPatch("todo", "doing"), patchBody())
            assertEquals(
                4,
                patchBody()
                    .getValue("expectedRevision")
                    .jsonPrimitive.content
                    .toInt(),
            )
            assertEquals(5, after.task.card.revision)
            assertNull(after.notice)
            assertFalse(after.saving)
        }

    @Test
    fun `finishing a task sends finishedAt with the current instant`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"), fixture("task-detail-reloaded-done"))
            backend.route("PATCH", taskPath, noContent())
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.changeStatus(TaskStatus.Done)
            viewModel.contentWith(TaskStatus.Done)

            assertEquals(expectedStatusPatch("todo", "done"), patchBody())
            assertEquals("2026-09-14T15:30:45.123Z", patchBody().getValue("finishedAt").jsonPrimitive.content)
        }

    @Test
    fun `leaving done sends a null finishedAt`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-done"), fixture("task-detail-person"))
            backend.route("PATCH", taskPath, noContent())
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.changeStatus(TaskStatus.Todo)
            viewModel.contentWith(TaskStatus.Todo)

            assertEquals(
                6,
                patchBody()
                    .getValue("expectedRevision")
                    .jsonPrimitive.content
                    .toInt(),
            )
            assertTrue(patchBody().getValue("finishedAt") is JsonNull)
        }

    @Test
    fun `picking the status that is already set writes nothing`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.changeStatus(TaskStatus.Todo)
            viewModel.changePriority(TaskPriority.High)

            assertTrue(backend.requestsTo("PATCH", taskPath).isEmpty())
        }

    @Test
    fun `changing the priority sends only the revision and the priority, then shows the re-read task`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"), fixture("task-detail-reloaded-urgent"))
            backend.route("PATCH", taskPath, noContent())
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.changePriority(TaskPriority.Urgent)
            val after =
                viewModel.state.first {
                    it is TaskDetailUiState.Content && it.task.priority == TaskPriority.Urgent && !it.saving
                } as TaskDetailUiState.Content

            val expected =
                (Fixtures.json("task-detail-text").jsonObject.getValue("priorityPatches") as JsonArray).map { it.jsonObject }.first {
                    it.getValue("priority").jsonPrimitive.content ==
                        "urgent"
                }
            assertEquals(expected.getValue("patch").jsonObject, patchBody())
            assertEquals(5, after.task.card.revision)
        }

    @Test
    fun `a stale revision re-reads the task before warning`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"), fixture("task-detail-reloaded-doing"))
            backend.route("PATCH", taskPath, status(409))
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.changeStatus(TaskStatus.Cancel)
            val after = viewModel.state.first { it is TaskDetailUiState.Content && it.notice != null } as TaskDetailUiState.Content

            assertEquals("Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira e tente de novo.", after.notice)
            assertEquals(TaskStatus.Doing, after.task.status)
            assertEquals(5, after.task.card.revision)
        }

    @Test
    fun `a refused change warns without re-reading, and the next change clears the warning`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            backend.route("PATCH", taskPath, status(500), noContent())
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.changeStatus(TaskStatus.Cancel)
            val failed = viewModel.state.first { it is TaskDetailUiState.Content && it.notice != null } as TaskDetailUiState.Content
            assertEquals("Não foi possível trocar o status. Tente novamente.", failed.notice)
            assertEquals(1, backend.requestsTo("GET", taskPath).size)

            viewModel.changePriority(TaskPriority.Low)
            val priorityFailed =
                viewModel.state.first {
                    it is TaskDetailUiState.Content &&
                        !it.saving &&
                        backend.requestsTo("PATCH", taskPath).size == 2
                } as TaskDetailUiState.Content
            assertNull(priorityFailed.notice)
        }

    @Test
    fun `a refused priority change says so`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            backend.route("PATCH", taskPath, status(500))
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.changePriority(TaskPriority.Low)
            val failed = viewModel.state.first { it is TaskDetailUiState.Content && it.notice != null } as TaskDetailUiState.Content

            assertEquals("Não foi possível trocar a prioridade. Tente novamente.", failed.notice)
        }

    @Test
    fun `the parent and the subtasks are read one by one, and one that fails drops out with a warning`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            backend.route("GET", "/api/tasks/task-parent", fixture("task-detail-parent"))
            backend.route("GET", "/api/tasks/task-sub-1", fixture("task-detail-sub-1"))
            backend.route("GET", "/api/tasks/task-sub-2", status(404))
            val viewModel = newViewModel()

            val content =
                viewModel.state.first {
                    it is TaskDetailUiState.Content && it.parent?.cards != null && it.subtasks?.cards != null
                } as TaskDetailUiState.Content

            assertEquals(listOf("task-parent"), content.parent?.cards?.map { it.id })
            assertFalse(content.parent?.failed ?: true)
            assertEquals(listOf("task-sub-1"), content.subtasks?.cards?.map { it.id })
            assertTrue(content.subtasks?.failed ?: false)
            assertEquals(1, backend.requestsTo("GET", "/api/tasks/task-parent").size)
        }

    @Test
    fun `a task with no parent and no subtasks has no hierarchy sections and reads nothing else`() =
        runTest {
            backend.route("GET", "/api/tasks/task-2", fixture("task-detail-minimal"))
            val content = newViewModel("task-2").content()
            Thread.sleep(100)

            assertNull(content.parent)
            assertNull(content.subtasks)
            assertEquals(1, backend.requests.size)
        }

    @Test
    fun `requests keep their relation, so created by and updated by stay apart`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            serveHierarchy()
            val content = newViewModel().content()

            val created = content.task.requests.filter { it.relation == RequestRelation.Generates }
            val updated = content.task.requests.filter { it.relation == RequestRelation.Updates }
            assertEquals(listOf("req-1"), created.map { it.id })
            assertEquals(listOf("req-2", "req-3"), updated.map { it.id })
            assertEquals("Marque a reunião de planejamento", created.single().name)
            assertEquals(Instant.parse("2026-09-01T12:00:00.000Z"), created.single().at)
        }

    @Test
    fun `deleting asks first, sends DELETE and then leaves`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            backend.route("DELETE", taskPath, noContent())
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.askDelete()
            assertTrue((viewModel.state.value as TaskDetailUiState.Content).delete.open)
            assertTrue(backend.requestsTo("DELETE", taskPath).isEmpty())

            viewModel.dismissDelete()
            assertFalse((viewModel.state.value as TaskDetailUiState.Content).delete.open)

            viewModel.askDelete()
            viewModel.confirmDelete()
            val after = viewModel.state.first { it is TaskDetailUiState.Content && it.deleted } as TaskDetailUiState.Content

            assertEquals(1, backend.requestsTo("DELETE", taskPath).size)
            assertFalse(after.delete.open)
        }

    @Test
    fun `deleting a task that is already gone leaves only the way back`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            backend.route("DELETE", taskPath, status(404))
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.askDelete()
            viewModel.confirmDelete()
            val after = viewModel.state.first { it is TaskDetailUiState.Content && it.delete.gone } as TaskDetailUiState.Content

            assertEquals("Esta tarefa já não existe. Ela foi apagada em outro lugar.", after.delete.error)
            assertFalse(after.delete.running)
            assertFalse(after.deleted)
        }

    @Test
    fun `a refused delete warns and can be tried again`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            backend.route("DELETE", taskPath, status(500), noContent())
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.content()

            viewModel.askDelete()
            viewModel.confirmDelete()
            val failed = viewModel.state.first { it is TaskDetailUiState.Content && it.delete.error != null } as TaskDetailUiState.Content
            assertEquals("Não foi possível excluir a tarefa. Tente novamente.", failed.delete.error)
            assertTrue(failed.delete.open)
            assertFalse(failed.delete.gone)

            viewModel.confirmDelete()
            viewModel.state.first { it is TaskDetailUiState.Content && it.deleted }
            assertEquals(2, backend.requestsTo("DELETE", taskPath).size)
        }

    /** O conteúdo com a tarefa principal e as subtarefas já lidas. */
    private suspend fun TaskDetailViewModel.withLinked(): TaskDetailUiState.Content =
        state.first {
            it is TaskDetailUiState.Content && it.parent?.cards != null && it.subtasks?.cards != null
        } as TaskDetailUiState.Content

    @Test
    fun `a pull reads the task again, keeps it on screen and turns the flag on and off`() =
        runTest {
            val gate = RequestGate()
            val bodies = ArrayDeque(listOf("task-detail-person", "task-detail-reloaded-doing"))
            backend.route("GET", taskPath) {
                gate.pass()
                fixture(if (bodies.size > 1) bodies.removeFirst() else bodies.first())
            }
            serveHierarchy()
            val viewModel = newViewModel()
            val before = viewModel.withLinked()
            gate.close()

            viewModel.pull()

            val during = viewModel.state.value as TaskDetailUiState.Content
            assertTrue(during.refreshing)
            assertEquals(before.task, during.task)
            assertEquals(before.parent, during.parent)
            gate.open()
            val after = viewModel.state.first { it is TaskDetailUiState.Content && !it.refreshing && it.task.status == TaskStatus.Doing }
            assertEquals(2, backend.requestsTo("GET", taskPath).size)
            assertEquals(before.parent, (after as TaskDetailUiState.Content).parent)
        }

    @Test
    fun `a second pull while one is in flight does nothing`() =
        runTest {
            val gate = RequestGate()
            backend.route("GET", taskPath) {
                gate.pass()
                fixture("task-detail-person")
            }
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.withLinked()
            gate.close()

            viewModel.pull()
            viewModel.pull()
            gate.open()
            viewModel.state.first { it is TaskDetailUiState.Content && !it.refreshing }

            assertEquals(2, backend.requestsTo("GET", taskPath).size)
        }

    @Test
    fun `a pull that fails keeps the task and says so, and the next pull that works takes the notice away`() =
        runTest {
            var broken = false
            backend.route("GET", taskPath) { if (broken) status(500) else fixture("task-detail-person") }
            serveHierarchy()
            val viewModel = newViewModel()
            val before = viewModel.withLinked()
            broken = true

            viewModel.pull()
            val failed =
                viewModel.state.first { it is TaskDetailUiState.Content && !it.refreshing } as TaskDetailUiState.Content

            assertEquals("Não foi possível atualizar a tarefa. Tente novamente.", failed.pullNotice)
            assertEquals(before.task, failed.task)
            assertEquals(before.parent, failed.parent)
            assertNull(failed.notice)

            broken = false
            viewModel.pull()
            val recovered =
                viewModel.state.first { it is TaskDetailUiState.Content && !it.refreshing } as TaskDetailUiState.Content

            assertNull(recovered.pullNotice)
            assertEquals(before.task, recovered.task)
        }

    @Test
    fun `a pull on a task that no longer exists says it was not found`() =
        runTest {
            var missing = 0
            backend.route("GET", taskPath) { if (missing != 0) status(missing) else fixture("task-detail-person") }
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.withLinked()
            missing = 404

            viewModel.pull()

            assertEquals(TaskDetailUiState.Missing, viewModel.state.first { it == TaskDetailUiState.Missing })
        }

    @Test
    fun `a pull on a task that turned foreign says it was not found`() =
        runTest {
            var missing = 0
            backend.route("GET", taskPath) { if (missing != 0) status(missing) else fixture("task-detail-person") }
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.withLinked()
            missing = 403

            viewModel.pull()

            assertEquals(TaskDetailUiState.Missing, viewModel.state.first { it == TaskDetailUiState.Missing })
        }

    @Test
    fun `a re-read after an edit that fails still goes to the error screen and sets no pull notice`() =
        runTest {
            var broken = false
            backend.route("GET", taskPath) { if (broken) status(500) else fixture("task-detail-person") }
            serveHierarchy()
            val viewModel = newViewModel()
            viewModel.withLinked()
            broken = true

            viewModel.reload()

            assertEquals(TaskDetailUiState.Failed, viewModel.state.first { it == TaskDetailUiState.Failed })
        }

    @Test
    fun `a pull does nothing before the task is read or on the error screen`() =
        runTest {
            val gate = RequestGate()
            gate.close()
            backend.route("GET", taskPath) {
                gate.pass()
                status(503)
            }
            val viewModel = newViewModel()

            viewModel.pull()
            gate.open()
            viewModel.state.first { it == TaskDetailUiState.Failed }
            viewModel.pull()

            assertEquals(1, backend.requestsTo("GET", taskPath).size)
            assertEquals(TaskDetailUiState.Failed, viewModel.state.value)
        }
}
