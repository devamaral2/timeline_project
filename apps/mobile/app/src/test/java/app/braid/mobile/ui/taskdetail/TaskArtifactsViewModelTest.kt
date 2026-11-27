package app.braid.mobile.ui.taskdetail

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.domain.task.ArtifactRelation
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.serveArtifactChoices
import app.braid.mobile.support.serveArtifactTasks
import app.braid.mobile.support.stopAndJoin
import app.braid.mobile.ui.picker.PickerSearchStatus
import app.braid.mobile.ui.taskartifacts.ArtifactPicker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** Os artefatos no detalhe da tarefa pela rede: a leitura, o seletor por tipo e o "+" que grava na hora. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskArtifactsViewModelTest {
    private val now = Instant.parse("2026-09-14T15:30:45.123Z")

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        backend.serveArtifactTasks()
        backend.serveArtifactChoices()
    }

    private val created = mutableListOf<TaskDetailViewModel>()

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(id: String): TaskDetailViewModel =
        TaskDetailViewModel(
            SavedStateHandle(mapOf("taskId" to id)),
            DefaultTaskDetailRepository(graph.apis.create(TaskDetailApi::class.java)),
            AppClock { now },
            DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)),
        ).also(created::add)

    private suspend fun TaskDetailViewModel.content(): TaskDetailUiState.Content =
        state.first { it is TaskDetailUiState.Content } as TaskDetailUiState.Content

    private suspend fun TaskDetailViewModel.picker(): ArtifactPicker =
        artifactPicker.state.first { it?.search?.status == PickerSearchStatus.Ready }!!

    private fun ArtifactPicker.ids() = search.results.map { it.id }

    private fun patchBody(id: String): JsonObject {
        val request: RecordedRequest = backend.requestsTo("PATCH", "/api/tasks/$id").single()
        return Json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject
    }

    private fun link(
        id: String,
        relation: String,
    ) = buildJsonObject {
        put("id", id)
        put("relation", relation)
    }

    private fun noContent() = MockResponse().setResponseCode(204)

    @Test
    fun `the detail carries the linked documents in the API's order, with their relation`() =
        runTest {
            val content = newViewModel("task-common").content()

            val links = content.task.artifacts
            assertEquals(listOf("doc-note", "doc-skill", "doc-router", "doc-sleep"), links.map { it.artifact.id })
            assertEquals(
                listOf(ArtifactRelation.Uses, ArtifactRelation.Updates, ArtifactRelation.Creates, ArtifactRelation.Uses),
                links.map { it.relation },
            )
            assertEquals(listOf(false, false, true, false), links.map { it.fromRecurrence })
        }

    @Test
    fun `the plus on a common task offers the user's own documents, 50 at a time, without the ones already linked`() =
        runTest {
            val viewModel = newViewModel("task-common")
            viewModel.content()

            viewModel.openArtifactPicker()
            val picker = viewModel.picker()

            assertEquals("Artefatos", picker.source.title)
            assertEquals("Buscar artefato para ligar", picker.source.searchLabel)
            assertEquals(listOf("doc-other", "doc-training"), picker.ids())
            val request = backend.requestsTo("GET", "/api/artifacts").single()
            assertEquals("50", request.requestUrl?.queryParameter("limit"))
            assertNull(request.requestUrl?.queryParameter("type"))
            assertNull(request.requestUrl?.queryParameter("scope"))
            assertNull(request.requestUrl?.queryParameter("q"))
        }

    @Test
    fun `typing searches the documents by the trimmed text after the pause`() =
        runTest {
            val viewModel = newViewModel("task-common")
            viewModel.content()
            viewModel.openArtifactPicker()
            viewModel.picker()

            viewModel.artifactPicker.type("  pauta ")
            val found =
                viewModel.artifactPicker.state.first {
                    it?.search?.query == "pauta" && it.search.status == PickerSearchStatus.Ready
                }

            assertEquals(listOf("doc-other"), found?.ids())
            assertEquals(
                "pauta",
                backend
                    .requestsTo("GET", "/api/artifacts")
                    .last()
                    .requestUrl
                    ?.queryParameter("q"),
            )
        }

    @Test
    fun `a failed search says so`() =
        runTest {
            backend.route("GET", "/api/artifacts", status(500))
            val viewModel = newViewModel("task-common")
            viewModel.content()

            viewModel.openArtifactPicker()

            val failed = viewModel.artifactPicker.state.first { it?.search?.status == PickerSearchStatus.Failed }
            assertEquals("Não foi possível buscar artefatos. Tente de novo.", failed?.source?.failedMessage)
        }

    @Test
    fun `choosing a document saves at once with the revision read and the whole list, then reads the task again`() =
        runTest {
            backend.route(
                "GET",
                "/api/tasks/task-common-empty",
                fixture("task-artifacts-common-empty"),
                fixture("task-artifacts-common-linked"),
            )
            backend.route("PATCH", "/api/tasks/task-common-empty", noContent())
            val viewModel = newViewModel("task-common-empty")
            viewModel.content()
            viewModel.openArtifactPicker()
            val other =
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "doc-other" }

            viewModel.artifactPicker.pick(other)

            val reread =
                viewModel.state.first {
                    it is TaskDetailUiState.Content && it.task.artifacts.size == 1 && !it.saving
                } as TaskDetailUiState.Content
            assertEquals(
                buildJsonObject {
                    put("expectedRevision", 5)
                    put("artifacts", JsonArray(listOf(link("doc-other", "uses"))))
                },
                patchBody("task-common-empty"),
            )
            assertEquals(6, reread.task.card.revision)
            assertNull(viewModel.artifactPicker.state.value)
            assertNull(reread.notice)
        }

    @Test
    fun `a task with documents keeps them, in order, ahead of the new one`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-common", noContent())
            val viewModel = newViewModel("task-common")
            viewModel.content()
            viewModel.openArtifactPicker()
            val other =
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "doc-other" }

            viewModel.artifactPicker.pick(other)
            viewModel.state.first { backend.requestsTo("PATCH", "/api/tasks/task-common").isNotEmpty() }

            val sent = patchBody("task-common")
            assertEquals(
                4,
                sent
                    .getValue("expectedRevision")
                    .jsonPrimitive.content
                    .toInt(),
            )
            assertEquals(
                listOf(
                    link("doc-note", "uses"),
                    link("doc-skill", "updates"),
                    link("doc-router", "creates"),
                    link("doc-sleep", "uses"),
                    link("doc-other", "uses"),
                ),
                sent.getValue("artifacts").jsonArray.toList(),
            )
        }

    @Test
    fun `on a meal the plus offers the global foods and then the user's, repeats allowed, and saves a copy`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-meal", noContent())
            val viewModel = newViewModel("task-meal")
            viewModel.content()

            viewModel.openArtifactPicker()
            val picker = viewModel.picker()

            assertEquals("Alimentos", picker.source.title)
            assertEquals("Buscar alimento para a refeição", picker.source.searchLabel)
            // Global primeiro, depois os próprios; o alimento já ligado (food-copy-1) continua na lista.
            assertEquals(listOf("food-global", "food-global-2", "food-own", "food-copy-1"), picker.ids())
            val requests = backend.requestsTo("GET", "/api/artifacts")
            assertEquals(2, requests.size)
            assertEquals(
                setOf("food|global|50", "food|null|50"),
                requests
                    .map {
                        "${it.requestUrl?.queryParameter(
                            "type",
                        )}|${it.requestUrl?.queryParameter("scope")}|${it.requestUrl?.queryParameter("limit")}"
                    }.toSet(),
            )

            viewModel.artifactPicker.pick(picker.search.results.first { it.id == "food-global" })
            viewModel.state.first { backend.requestsTo("PATCH", "/api/tasks/task-meal").isNotEmpty() }

            val sent = patchBody("task-meal")
            assertEquals(
                3,
                sent
                    .getValue("expectedRevision")
                    .jsonPrimitive.content
                    .toInt(),
            )
            val links = sent.getValue("artifacts").jsonArray
            assertEquals(4, links.size)
            assertEquals(buildJsonObject { put("copyOf", "food-global") }, links.last())
            assertEquals(link("food-created", "creates"), links[2])
        }

    @Test
    fun `on a training the plus offers only the global exercises not yet linked`() =
        runTest {
            val viewModel = newViewModel("task-training")
            viewModel.content()

            viewModel.openArtifactPicker()
            val picker = viewModel.picker()

            assertEquals("Exercícios", picker.source.title)
            assertEquals(listOf("ex-bench"), picker.ids())
            val request = backend.requestsTo("GET", "/api/artifacts").single()
            assertEquals("workout", request.requestUrl?.queryParameter("type"))
            assertEquals("global", request.requestUrl?.queryParameter("scope"))
            assertEquals("50", request.requestUrl?.queryParameter("limit"))
        }

    @Test
    fun `a stale revision reads the task again and warns, without saving`() =
        runTest {
            backend.route("GET", "/api/tasks/task-common-empty", fixture("task-artifacts-common-empty"), fixture("task-artifacts-reloaded"))
            backend.route("PATCH", "/api/tasks/task-common-empty", status(409))
            val viewModel = newViewModel("task-common-empty")
            viewModel.content()
            viewModel.openArtifactPicker()
            viewModel.artifactPicker.pick(
                viewModel
                    .picker()
                    .search.results
                    .first(),
            )

            val warned =
                viewModel.state.first {
                    it is TaskDetailUiState.Content && it.notice != null && !it.saving
                } as TaskDetailUiState.Content

            assertEquals(STALE_TASK_NOTICE, warned.notice)
            assertEquals(6, warned.task.card.revision)
            assertEquals(1, backend.requestsTo("PATCH", "/api/tasks/task-common-empty").size)
        }

    @Test
    fun `another failure says the document was not linked`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-common-empty", status(500))
            val viewModel = newViewModel("task-common-empty")
            viewModel.content()
            viewModel.openArtifactPicker()
            viewModel.artifactPicker.pick(
                viewModel
                    .picker()
                    .search.results
                    .first(),
            )

            val failed =
                viewModel.state.first {
                    it is TaskDetailUiState.Content && it.notice != null && !it.saving
                } as TaskDetailUiState.Content

            assertEquals("Não foi possível ligar o artefato. Tente novamente.", failed.notice)
            assertFalse(failed.saving)
        }

    @Test
    fun `closing the sheet links nothing`() =
        runTest {
            val viewModel = newViewModel("task-common-empty")
            viewModel.content()
            viewModel.openArtifactPicker()
            viewModel.picker()

            viewModel.artifactPicker.close()

            assertNull(viewModel.artifactPicker.state.value)
            assertTrue(backend.requestsTo("PATCH", "/api/tasks/task-common-empty").isEmpty())
        }
}
