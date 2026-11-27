package app.braid.mobile.ui.taskedit

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.data.projects.DefaultProjectRepository
import app.braid.mobile.data.projects.ProjectsApi
import app.braid.mobile.data.requests.DefaultAgentRequestRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.tasks.DefaultRecurrenceRepository
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.DefaultTaskEditRepository
import app.braid.mobile.data.tasks.DefaultTaskPickerRepository
import app.braid.mobile.data.tasks.RecurrenceApi
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.tasks.TaskEditApi
import app.braid.mobile.data.tasks.TaskPickerApi
import app.braid.mobile.domain.project.Project
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.stopAndJoin
import app.braid.mobile.ui.picker.PickerSearchStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** O campo "Projeto" do formulário pela rede: a escolha, a busca, a criação, o nome repetido e o que o Salvar manda. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskEditProjectViewModelTest {
    private val now = Instant.parse("2026-09-14T15:30:45.123Z")
    private val timeline = Project("project-timeline", "timeline_project", personal = false)
    private val skills = Project("project-skills", "agent-skills", personal = false)
    private val personal = Project("project-personal", "diario", personal = true)
    private val created = Project("project-new", "braid", personal = false)

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val viewModels = mutableListOf<TaskEditViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        backend.route("GET", "/api/projects", fixture("projects-list"))
        backend.route("POST", "/api/tasks", fixture("task-edit-created", 201))
        backend.route(
            "GET",
            "/api/tasks/task-p",
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody(
                    Fixtures
                        .json("task-edit-tasks")
                        .jsonObject
                        .getValue("inProject")
                        .toString(),
                ),
        )
        backend.route("PATCH", "/api/tasks/task-p", MockResponse().setResponseCode(204))
    }

    @After
    fun tearDown() {
        viewModels.forEach { it.stopAndJoin() }
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
            DefaultRecurrenceRepository(graph.apis.create(RecurrenceApi::class.java)),
            AppClock { now },
            DefaultTaskPickerRepository(graph.apis.create(TaskPickerApi::class.java)),
            DefaultAgentRequestRepository(graph.apis.create(RequestsApi::class.java)),
            graph.sessionRepository,
            DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)),
            DefaultProjectRepository(graph.apis.create(ProjectsApi::class.java)),
        ).also(viewModels::add)
    }

    private suspend fun TaskEditViewModel.form(): TaskEditUiState.Form = state.first { it is TaskEditUiState.Form } as TaskEditUiState.Form

    private val TaskEditViewModel.draft get() = (state.value as TaskEditUiState.Form).draft

    private suspend fun TaskEditViewModel.listed(): ProjectPicker =
        projectPicker.state.first { it?.search?.status == PickerSearchStatus.Ready }!!

    private fun body(request: RecordedRequest): JsonObject = Json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject

    private fun names(picker: ProjectPicker) = picker.search.results.map { it.name }

    @Test
    fun `a new task starts without a project and creating it sends no projectId`() =
        runTest {
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()

            assertNull(viewModel.draft.project)
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            assertFalse(body(backend.requestsTo("POST", "/api/tasks").single()).containsKey("projectId"))
            assertEquals(0, backend.requestsTo("GET", "/api/projects").size)
        }

    @Test
    fun `the picker lists personal first and the others by name`() =
        runTest {
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()

            viewModel.openProjectPicker()
            val picker = viewModel.listed()

            assertEquals(listOf("diario", "Açaí", "agent-skills", "timeline_project"), names(picker))
            assertTrue(
                picker.search.results
                    .first()
                    .personal,
            )
        }

    @Test
    fun `the search finds a project by name, without accents or case`() =
        runTest {
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.type("ACAI")
            val found = viewModel.projectPicker.state.first { it?.search?.query == "ACAI" && it.search.status == PickerSearchStatus.Ready }

            assertEquals(listOf("Açaí"), names(found!!))
        }

    @Test
    fun `choosing a project fills the draft, closes the picker and sends the id on create`() =
        runTest {
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.pick(timeline)

            assertEquals(timeline, viewModel.draft.project)
            assertNull(viewModel.projectPicker.state.value)
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }
            assertEquals(JsonPrimitive("project-timeline"), body(backend.requestsTo("POST", "/api/tasks").single())["projectId"])
        }

    @Test
    fun `choosing personal on a new task sends no projectId`() =
        runTest {
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.pick(personal)
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            assertFalse(body(backend.requestsTo("POST", "/api/tasks").single()).containsKey("projectId"))
        }

    @Test
    fun `editing opens on the project of the task, and an untouched project is not sent`() =
        runTest {
            val viewModel = newViewModel(taskId = "task-p")
            viewModel.form()
            assertEquals(timeline, viewModel.draft.project)

            viewModel.update { it.copy(name = "Revisar o contrato (v2)") }
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            assertFalse(body(backend.requestsTo("PATCH", "/api/tasks/task-p").single()).containsKey("projectId"))
        }

    @Test
    fun `moving a task to another project sends the id with the revision`() =
        runTest {
            val viewModel = newViewModel(taskId = "task-p")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.pick(skills)
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            val patch = body(backend.requestsTo("PATCH", "/api/tasks/task-p").single())
            assertEquals(JsonPrimitive("project-skills"), patch["projectId"])
            assertEquals(JsonPrimitive(2), patch["expectedRevision"])
        }

    @Test
    fun `choosing personal on a task in a project sends a null projectId`() =
        runTest {
            val viewModel = newViewModel(taskId = "task-p")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.pick(personal)
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            assertEquals(JsonNull, body(backend.requestsTo("PATCH", "/api/tasks/task-p").single())["projectId"])
        }

    @Test
    fun `choosing personal on an occurrence of a series in a project changes only the occurrence and never patches the series`() =
        runTest {
            val viewModel = occurrenceInProject()

            viewModel.projectPicker.pick(personal)
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            assertEquals(JsonNull, body(backend.requestsTo("PATCH", "/api/tasks/task-occ-p").single())["projectId"])
            assertEquals(listOf("/api/tasks/task-occ-p"), backend.requests.filter { it.method == "PATCH" }.map { it.path })
            assertTrue(backend.requestsTo("PATCH", "/api/recurrences/rec-1").isEmpty())
        }

    @Test
    fun `the rule editor patch of a series carries the rule only, even when the project of the occurrence changed too`() =
        runTest {
            val viewModel = occurrenceInProject()

            viewModel.projectPicker.pick(skills)
            viewModel.changeRecurrence { it.copy(interval = 2) }
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }

            val series = body(backend.requestsTo("PATCH", "/api/recurrences/rec-1").single())
            assertEquals(setOf("expectedRevision", "interval"), series.keys)
            assertEquals(JsonPrimitive("project-skills"), body(backend.requestsTo("PATCH", "/api/tasks/task-occ-p").single())["projectId"])
        }

    private suspend fun occurrenceInProject(): TaskEditViewModel {
        backend.route("GET", "/api/tasks/task-occ-p", json(Fixtures.json("task-edit-tasks").jsonObject.getValue("occurrenceInProject")))
        backend.route("GET", "/api/recurrences/rec-1", json(Fixtures.json("recurrence-series").jsonObject.getValue("weeklyInProject")))
        backend.route("PATCH", "/api/tasks/task-occ-p", MockResponse().setResponseCode(204))
        backend.route("PATCH", "/api/recurrences/rec-1", MockResponse().setResponseCode(204))
        val viewModel = newViewModel(taskId = "task-occ-p")
        viewModel.state.first { (it as? TaskEditUiState.Form)?.recurrence?.series is SeriesLoad.Ready }
        viewModel.openProjectPicker()
        viewModel.listed()
        return viewModel
    }

    private fun json(element: JsonElement) = MockResponse().setHeader("Content-Type", "application/json").setBody(element.toString())

    @Test
    fun `closing the picker keeps the project of the draft`() =
        runTest {
            val viewModel = newViewModel(taskId = "task-p")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.close()

            assertNull(viewModel.projectPicker.state.value)
            assertEquals(timeline, viewModel.draft.project)
        }

    @Test
    fun `creating a project from the typed text picks it`() =
        runTest {
            backend.route("POST", "/api/projects", fixture("projects-created", 201))
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.type("  braid ")
            viewModel.projectPicker.create()
            viewModel.projectPicker.state.first { it == null }

            assertEquals(created, viewModel.draft.project)
            assertEquals(
                Json.parseToJsonElement("""{"name":"braid"}"""),
                body(backend.requestsTo("POST", "/api/projects").single()),
            )
            viewModel.save()
            viewModel.state.first { (it as TaskEditUiState.Form).done }
            assertEquals(JsonPrimitive("project-new"), body(backend.requestsTo("POST", "/api/tasks").single())["projectId"])
        }

    @Test
    fun `a repeated name shows the message and keeps the picker open`() =
        runTest {
            backend.route("POST", "/api/projects", status(409))
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.type("DIARIO")
            viewModel.projectPicker.create()
            val failed = viewModel.projectPicker.state.first { it?.footer is ProjectFooter.Failed }

            assertEquals(ProjectFooter.Failed(PROJECT_NAME_TAKEN), failed?.footer)
            assertNull(viewModel.draft.project)
        }

    @Test
    fun `an invalid name and a failure each show their own message`() =
        runTest {
            var code = 400
            backend.route("POST", "/api/projects") { status(code) }
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()
            viewModel.projectPicker.type("x".repeat(61))

            viewModel.projectPicker.create()
            assertEquals(
                ProjectFooter.Failed(PROJECT_NAME_INVALID),
                viewModel.projectPicker.state
                    .first { it?.footer is ProjectFooter.Failed }
                    ?.footer,
            )

            code = 500
            viewModel.projectPicker.create()
            assertEquals(
                ProjectFooter.Failed(PROJECT_CREATE_FAILED),
                viewModel.projectPicker.state
                    .first { it?.footer == ProjectFooter.Failed(PROJECT_CREATE_FAILED) }
                    ?.footer,
            )
        }

    @Test
    fun `create does nothing while the field is empty`() =
        runTest {
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()
            viewModel.openProjectPicker()
            viewModel.listed()

            viewModel.projectPicker.type("   ")
            viewModel.projectPicker.create()

            assertEquals(0, backend.requestsTo("POST", "/api/projects").size)
            assertEquals(
                ProjectFooter.Idle,
                viewModel.projectPicker.state.value
                    ?.footer,
            )
        }

    @Test
    fun `a failed search shows the failure instead of an empty list`() =
        runTest {
            backend.route("GET", "/api/projects", status(500))
            val viewModel = newViewModel(name = "Comprar pão")
            viewModel.form()

            viewModel.openProjectPicker()
            val failed = viewModel.projectPicker.state.first { it?.search?.status == PickerSearchStatus.Failed }

            assertTrue(failed!!.search.results.isEmpty())
        }
}
