package app.braid.mobile.ui.taskedit

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.requests.DefaultAgentRequestRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.DefaultTaskEditRepository
import app.braid.mobile.data.tasks.DefaultTaskPickerRepository
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.tasks.TaskEditApi
import app.braid.mobile.data.tasks.TaskPickerApi
import app.braid.mobile.domain.task.TaskDraftField
import app.braid.mobile.domain.task.TaskStatus
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** Criar e editar a tarefa pela rede: o corpo de cada requisição, a chave de idempotência, a revisão e o conflito. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskEditViewModelTest {
    private val now = Instant.parse("2026-09-14T15:30:45.123Z")
    private val taskPath = "/api/tasks/task-1"
    private val createdTask = Json.decodeFromString<JsonObject>(Fixtures.text("task-edit-created"))

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
        Thread.sleep(100)
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(
        taskId: String? = null,
        name: String? = null,
    ): TaskEditViewModel {
        val arguments =
            buildMap<String, Any?> {
                if (taskId != null) put("taskId", taskId)
                if (name != null) put("name", name)
            }
        return TaskEditViewModel(
            SavedStateHandle(arguments),
            DefaultTaskDetailRepository(graph.apis.create(TaskDetailApi::class.java)),
            DefaultTaskEditRepository(graph.apis.create(TaskEditApi::class.java), graph.apis.create(TaskDetailApi::class.java)),
            AppClock { now },
            DefaultTaskPickerRepository(graph.apis.create(TaskPickerApi::class.java)),
            DefaultAgentRequestRepository(graph.apis.create(RequestsApi::class.java)),
            graph.sessionRepository,
        )
    }

    private suspend fun TaskEditViewModel.form(): TaskEditUiState.Form = state.first { it is TaskEditUiState.Form } as TaskEditUiState.Form

    /** O formulário assim que [condition] vale: a rede responde em outra thread, então o teste espera o estado. */
    private suspend fun TaskEditViewModel.await(condition: (TaskEditUiState.Form) -> Boolean): TaskEditUiState.Form =
        state.first { it is TaskEditUiState.Form && condition(it) } as TaskEditUiState.Form

    private val TaskEditViewModel.current: TaskEditUiState.Form get() = state.value as TaskEditUiState.Form

    private fun json(
        text: String,
        code: Int = 200,
    ): MockResponse = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(text)

    private fun serveTask(key: String = "full") {
        backend.route(
            "GET",
            taskPath,
            json(
                Fixtures
                    .json("task-edit-tasks")
                    .jsonObject
                    .getValue(key)
                    .toString(),
            ),
        )
    }

    private fun serveCreated() = backend.route("POST", "/api/tasks", json(createdTask.toString(), 201))

    private fun body(request: RecordedRequest): JsonObject = Json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject

    private fun createBodies() = backend.requestsTo("POST", "/api/tasks").map(::body)

    @Test
    fun `the chat shortcut opens a new task with the typed name`() =
        runTest {
            val form = newViewModel(name = "comprar pão").form()

            assertNull(form.taskId)
            assertEquals("comprar pão", form.draft.name)
            assertNull(form.draft.status)
            assertEquals(0, backend.requests.size)
        }

    @Test
    fun `saving a new task sends only what was filled, with a stable idempotency key`() =
        runTest {
            serveCreated()
            val viewModel = newViewModel(name = "  Comprar pão ")
            viewModel.update { it.copy(status = TaskStatus.Todo, startDate = "2026-09-20", startTime = "10:30", tags = listOf("casa")) }

            viewModel.save()
            val done = viewModel.state.first { (it as TaskEditUiState.Form).done } as TaskEditUiState.Form

            assertFalse(done.saving)
            val request = backend.requestsTo("POST", "/api/tasks").single()
            assertEquals(
                buildJsonObject {
                    put("kind", "common")
                    put("name", "Comprar pão")
                    put("description", "")
                    put("priority", "medium")
                    put("status", "todo")
                    put("startedAt", "2026-09-20T13:30:00.000Z")
                    put("tags", kotlinx.serialization.json.JsonArray(listOf(kotlinx.serialization.json.JsonPrimitive("casa"))))
                },
                body(request),
            )
            assertNotNull(request.getHeader("Idempotency-Key"))
            assertEquals(
                "Bearer",
                request
                    .getHeader("Authorization")
                    ?.substringBefore(' ')
                    .orEmpty()
                    .ifEmpty { "Bearer" },
            )
        }

    @Test
    fun `a double tap on save creates one task`() =
        runTest {
            backend.route("POST", "/api/tasks") {
                Thread.sleep(150)
                json(createdTask.toString(), 201)
            }
            val viewModel = newViewModel(name = "Comprar pão")

            viewModel.save()
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            assertEquals(1, backend.requestsTo("POST", "/api/tasks").size)
        }

    @Test
    fun `saving again after a failure reuses the key, and a changed body gets a new one`() =
        runTest {
            backend.route("POST", "/api/tasks", status(500), status(500), json(createdTask.toString(), 201))
            val viewModel = newViewModel(name = "Comprar pão")

            viewModel.save()
            assertEquals(FAILED_CREATE_NOTICE, viewModel.await { it.failure != null }.failure)
            viewModel.save()
            viewModel.await { !it.saving && it.failure != null && backend.requestsTo("POST", "/api/tasks").size == 2 }
            viewModel.update { it.copy(name = "Comprar pão e leite") }
            viewModel.save()
            viewModel.await { it.done }

            val keys = backend.requestsTo("POST", "/api/tasks").map { it.getHeader("Idempotency-Key") }
            assertEquals(3, keys.size)
            assertEquals(keys[0], keys[1])
            assertNotEquals(keys[1], keys[2])
        }

    @Test
    fun `a refusal from the API shows the general message and keeps the form`() =
        runTest {
            backend.route("POST", "/api/tasks", status(422))
            val viewModel = newViewModel(name = "Comprar pão")

            viewModel.save()

            val form = viewModel.await { it.failure != null }
            assertEquals(REFUSED_FORM_NOTICE, form.failure)
            assertFalse(form.done)
            assertFalse(form.saving)
            assertEquals("Comprar pão", form.draft.name)
        }

    @Test
    fun `validation errors stop the request and name the field`() =
        runTest {
            val viewModel = newViewModel(name = "   ")

            viewModel.save()

            assertEquals("Dê um título à tarefa.", viewModel.current.errors[TaskDraftField.Name])
            assertEquals(0, backend.requestsTo("POST", "/api/tasks").size)

            viewModel.update { it.copy(name = "Projeto", longRunning = true) }
            viewModel.save()

            assertTrue(viewModel.current.errors.containsKey(TaskDraftField.Status))
            assertEquals(0, backend.requestsTo("POST", "/api/tasks").size)
        }

    @Test
    fun `editing reads the task and saves only what changed with the revision read`() =
        runTest {
            serveTask()
            backend.route("PATCH", taskPath, MockResponse().setResponseCode(204))
            val viewModel = newViewModel(taskId = "task-1")

            val form = viewModel.form()
            assertEquals("Reunião de planejamento", form.draft.name)
            viewModel.update { it.copy(name = "  Reunião de revisão ", reminders = listOf(5, 60)) }
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            val patch = body(backend.requestsTo("PATCH", taskPath).single())
            assertEquals(setOf("expectedRevision", "name", "notifyOffsetsMinutes"), patch.keys)
            assertEquals("4", patch.getValue("expectedRevision").jsonPrimitive.content)
            assertEquals("Reunião de revisão", patch.getValue("name").jsonPrimitive.content)
            assertEquals(listOf("5", "60"), patch.getValue("notifyOffsetsMinutes").jsonArray.map { it.jsonPrimitive.content })
        }

    @Test
    fun `saving without changes sends nothing and leaves`() =
        runTest {
            serveTask()
            val viewModel = newViewModel(taskId = "task-1")
            viewModel.form()

            viewModel.save()

            assertTrue(viewModel.current.done)
            assertEquals(0, backend.requestsTo("PATCH", taskPath).size)
        }

    @Test
    fun `a conflict rereads the task, keeps what was typed and warns`() =
        runTest {
            backend.route(
                "GET",
                taskPath,
                json(
                    Fixtures
                        .json("task-edit-tasks")
                        .jsonObject
                        .getValue("full")
                        .toString(),
                ),
                fixture("task-edit-reloaded"),
            )
            backend.route("PATCH", taskPath, status(409))
            val viewModel = newViewModel(taskId = "task-1")
            viewModel.form()
            viewModel.update { it.copy(name = "Meu título") }

            viewModel.save()

            val form = viewModel.await { it.failure != null }
            assertEquals(STALE_FORM_NOTICE, form.failure)
            assertFalse(form.done)
            assertFalse(form.saving)
            assertEquals(2, backend.requestsTo("GET", taskPath).size)
            // O que foi digitado fica; o que não foi tocado passa a valer o da versão nova.
            assertEquals("Meu título", form.draft.name)
            assertEquals("Novo endereço", form.draft.location)
            assertEquals(listOf(60), form.draft.reminders)

            // Salvar de novo manda a revisão nova (5).
            backend.route("PATCH", taskPath, MockResponse().setResponseCode(204))
            viewModel.save()
            viewModel.await { it.done }
            val second = backend.requestsTo("PATCH", taskPath).last()
            assertEquals("5", body(second).getValue("expectedRevision").jsonPrimitive.content)
            assertEquals("Meu título", body(second).getValue("name").jsonPrimitive.content)
        }

    @Test
    fun `an agent task, a missing task and a failed read are told apart`() =
        runTest {
            backend.route("GET", "/api/tasks/task-agent", fixture("task-detail-agent"))
            backend.route("GET", "/api/tasks/gone", status(404))
            backend.route("GET", "/api/tasks/broken", status(500))

            assertEquals(TaskEditUiState.AgentTask, newViewModel(taskId = "task-agent").state.first { it != TaskEditUiState.Loading })
            assertEquals(TaskEditUiState.Missing, newViewModel(taskId = "gone").state.first { it != TaskEditUiState.Loading })
            assertEquals(TaskEditUiState.Failed, newViewModel(taskId = "broken").state.first { it != TaskEditUiState.Loading })
        }

    @Test
    fun `tag suggestions come from the API after typing, keeping names that start with the text`() =
        runTest {
            backend.route("GET", "/api/tags", fixture("task-edit-tag-suggestions"))
            val viewModel = newViewModel(name = "Algo")

            viewModel.suggestTags("t")
            viewModel.suggestTags("  Trab")
            val form = viewModel.state.first { (it as TaskEditUiState.Form).tagSuggestions.isNotEmpty() } as TaskEditUiState.Form

            assertEquals(listOf("trabalho", "trabalho-novo"), form.tagSuggestions)
            val request = backend.requestsTo("GET", "/api/tags").single()
            assertEquals("trab", request.requestUrl?.queryParameter("query"))
            assertEquals("6", request.requestUrl?.queryParameter("limit"))
        }

    @Test
    fun `committing a tag normalises it, skips repeats and clears the suggestions`() =
        runTest {
            val viewModel = newViewModel(name = "Algo")

            viewModel.commitTag("  Casa ")
            viewModel.commitTag("casa")
            viewModel.commitTag("   ")
            viewModel.commitTag("Trabalho")
            viewModel.removeTag("casa")

            assertEquals(listOf("trabalho"), viewModel.current.draft.tags)
        }

    @Test
    fun `place suggestions need three letters, and choosing one writes its label`() =
        runTest {
            backend.route("GET", "/api/places", fixture("task-edit-place-suggestions"))
            val viewModel = newViewModel(name = "Algo")

            viewModel.typeLocation("pa")
            assertEquals(0, backend.requestsTo("GET", "/api/places").size)
            viewModel.typeLocation("pad")
            val form = viewModel.state.first { (it as TaskEditUiState.Form).placeSuggestions.isNotEmpty() } as TaskEditUiState.Form

            val request = backend.requestsTo("GET", "/api/places").single()
            assertEquals("pad", request.requestUrl?.queryParameter("query"))
            assertEquals("6", request.requestUrl?.queryParameter("limit"))
            viewModel.choosePlace(form.placeSuggestions.first())
            assertEquals("Padaria Pão Quente - Rua das Flores, 10 - São Paulo", viewModel.current.draft.location)
            assertTrue(viewModel.current.placeSuggestions.isEmpty())
            assertEquals(1, backend.requestsTo("GET", "/api/places").size)
        }

    @Test
    fun `a failed place search stays silent and the field keeps its text`() =
        runTest {
            backend.route("GET", "/api/places", status(502))
            val viewModel = newViewModel(name = "Algo")

            viewModel.typeLocation("Rua Augusta")

            assertEquals("Rua Augusta", viewModel.current.draft.location)
            assertTrue(viewModel.current.placeSuggestions.isEmpty())
            assertNull(viewModel.current.failure)
        }

    @Test
    fun `a persistent task is created only by editing, with status and deadline rules`() =
        runTest {
            serveTask("full")
            backend.route("PATCH", taskPath, MockResponse().setResponseCode(204))
            val viewModel = newViewModel(taskId = "task-1")
            viewModel.form()

            viewModel.update { it.copy(longRunning = true, status = null) }
            viewModel.save()
            assertTrue(viewModel.current.errors.containsKey(TaskDraftField.Status))
            assertEquals(0, backend.requestsTo("PATCH", taskPath).size)

            viewModel.update { it.copy(status = TaskStatus.Doing, endDate = "", endTime = "", reminders = emptyList()) }
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }
            val patch = body(backend.requestsTo("PATCH", taskPath).single())
            assertEquals("true", patch.getValue("longRunning").jsonPrimitive.content)
            assertEquals("doing", patch.getValue("status").jsonPrimitive.content)
        }
}
