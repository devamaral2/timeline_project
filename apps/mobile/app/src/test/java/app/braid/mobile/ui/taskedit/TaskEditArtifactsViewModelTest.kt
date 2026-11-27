package app.braid.mobile.ui.taskedit

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.data.projects.DefaultProjectRepository
import app.braid.mobile.data.projects.ProjectsApi
import app.braid.mobile.data.requests.DefaultAgentRequestRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.data.tasks.DefaultRecurrenceRepository
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.DefaultTaskEditRepository
import app.braid.mobile.data.tasks.DefaultTaskPickerRepository
import app.braid.mobile.data.tasks.RecurrenceApi
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.tasks.TaskEditApi
import app.braid.mobile.data.tasks.TaskPickerApi
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.task.ArtifactRelation
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
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
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** Os artefatos na edição da tarefa pela rede: o seletor por tipo, ordenar, tirar e o que o Salvar manda. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskEditArtifactsViewModelTest {
    private val now = Instant.parse("2026-09-14T15:30:45.123Z")

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        graph.storage.session = StoredSession("access", "refresh", userId = "user-7", email = "a@b.c", name = "Ana")
        backend.serveArtifactTasks()
        backend.serveArtifactChoices()
    }

    private val created = mutableListOf<TaskEditViewModel>()

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private suspend fun newViewModel(taskId: String): TaskEditViewModel {
        graph.sessionRepository.restore()
        val detail = graph.apis.create(TaskDetailApi::class.java)
        return TaskEditViewModel(
            SavedStateHandle(mapOf("taskId" to taskId)),
            DefaultTaskDetailRepository(detail),
            DefaultTaskEditRepository(graph.apis.create(TaskEditApi::class.java), detail),
            DefaultRecurrenceRepository(graph.apis.create(RecurrenceApi::class.java)),
            AppClock { now },
            DefaultTaskPickerRepository(graph.apis.create(TaskPickerApi::class.java)),
            DefaultAgentRequestRepository(graph.apis.create(RequestsApi::class.java)),
            graph.sessionRepository,
            DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)),
            DefaultProjectRepository(graph.apis.create(ProjectsApi::class.java)),
        ).also(created::add)
    }

    private suspend fun TaskEditViewModel.opened(): TaskEditViewModel {
        state.first { it is TaskEditUiState.Form }
        return this
    }

    private val TaskEditViewModel.draft get() = (state.value as TaskEditUiState.Form).draft

    private suspend fun TaskEditViewModel.picker(): ArtifactPicker =
        artifactPicker.state.first {
            it?.search?.status ==
                PickerSearchStatus.Ready
        }!!

    private fun ids(viewModel: TaskEditViewModel) = viewModel.draft.artifacts.map { it.id }

    private fun patchBody(taskId: String): JsonObject =
        Json
            .parseToJsonElement(
                backend
                    .requestsTo("PATCH", "/api/tasks/$taskId")
                    .single()
                    .body
                    .clone()
                    .readUtf8(),
            ).jsonObject

    private fun link(
        id: String,
        relation: String,
    ) = buildJsonObject {
        put("id", id)
        put("relation", relation)
    }

    private fun noContent() = MockResponse().setResponseCode(204)

    @Test
    fun `the form opens with the task's documents, in the API's order`() =
        runTest {
            val viewModel = newViewModel("task-common").opened()

            assertEquals(listOf("doc-note", "doc-skill", "doc-router", "doc-sleep"), ids(viewModel))
            assertEquals(
                listOf(ArtifactRelation.Uses, ArtifactRelation.Updates, ArtifactRelation.Creates, ArtifactRelation.Uses),
                viewModel.draft.artifacts.map { it.relation },
            )
        }

    @Test
    fun `up and down swap with the neighbour that has a position, and what the task created stays put`() =
        runTest {
            val viewModel = newViewModel("task-common").opened()

            viewModel.moveArtifact("doc-skill", 1)
            assertEquals(listOf("doc-note", "doc-sleep", "doc-router", "doc-skill"), ids(viewModel))

            viewModel.moveArtifact("doc-router", -1)
            assertEquals(listOf("doc-note", "doc-sleep", "doc-router", "doc-skill"), ids(viewModel))

            viewModel.moveArtifact("doc-note", -1)
            assertEquals(listOf("doc-note", "doc-sleep", "doc-router", "doc-skill"), ids(viewModel))
        }

    @Test
    fun `removing only unlinks, so nothing is sent until Save and the document is never deleted`() =
        runTest {
            val viewModel = newViewModel("task-common").opened()

            viewModel.removeArtifact("doc-skill")

            assertEquals(listOf("doc-note", "doc-router", "doc-sleep"), ids(viewModel))
            assertTrue(backend.requests.none { it.method != "GET" })
        }

    @Test
    fun `Save sends the whole list in screen order with the revision read, and nothing else`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-common", noContent())
            val viewModel = newViewModel("task-common").opened()

            viewModel.moveArtifact("doc-note", 1)
            viewModel.removeArtifact("doc-sleep")
            viewModel.save()
            viewModel.state.first { (it as? TaskEditUiState.Form)?.done == true }

            assertEquals(
                buildJsonObject {
                    put("expectedRevision", 4)
                    put(
                        "artifacts",
                        JsonArray(
                            listOf(link("doc-skill", "updates"), link("doc-note", "uses"), link("doc-router", "creates")),
                        ),
                    )
                },
                patchBody("task-common"),
            )
        }

    @Test
    fun `an untouched list sends nothing`() =
        runTest {
            val viewModel = newViewModel("task-common").opened()

            viewModel.save()
            viewModel.state.first { (it as? TaskEditUiState.Form)?.done == true }

            assertTrue(backend.requestsTo("PATCH", "/api/tasks/task-common").isEmpty())
        }

    @Test
    fun `the plus offers the user's documents, leaves out the linked ones, and appends the choice with uses`() =
        runTest {
            val viewModel = newViewModel("task-common").opened()

            viewModel.openArtifactPicker()
            val picker = viewModel.picker()
            assertEquals(listOf("doc-other", "doc-training"), picker.search.results.map { it.id })
            viewModel.artifactPicker.pick(picker.search.results.first { it.id == "doc-other" })

            assertEquals(listOf("doc-note", "doc-skill", "doc-router", "doc-sleep", "doc-other"), ids(viewModel))
            assertEquals(
                ArtifactRelation.Uses,
                viewModel.draft.artifacts
                    .last()
                    .relation,
            )
            assertNull(viewModel.artifactPicker.state.value)
            assertTrue(backend.requests.none { it.method != "GET" })
        }

    @Test
    fun `the picker of the edit form lists the three new types and links the ones chosen, in order, with uses`() =
        runTest {
            backend.route("GET", "/api/artifacts", fixture("task-artifacts-picker-free-text"))
            backend.route("PATCH", "/api/tasks/task-common-empty", noContent())
            val viewModel = newViewModel("task-common-empty").opened()

            viewModel.openArtifactPicker()
            val picker = viewModel.picker()
            assertEquals(listOf("doc-news", "doc-email", "doc-youtube"), picker.search.results.map { it.id })
            viewModel.artifactPicker.pick(picker.search.results.first { it.id == "doc-youtube" })
            viewModel.openArtifactPicker()
            viewModel.artifactPicker.pick(
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "doc-news" },
            )

            // Os já ligados saem da lista; o rascunho guarda o tipo de cada um.
            assertEquals(listOf("doc-youtube", "doc-news"), ids(viewModel))
            assertEquals(listOf(ArtifactType.YoutubeTranscript, ArtifactType.News), viewModel.draft.artifacts.map { it.type })
            viewModel.save()
            viewModel.state.first { (it as? TaskEditUiState.Form)?.done == true }

            assertEquals(
                listOf(link("doc-youtube", "uses"), link("doc-news", "uses")),
                patchBody("task-common-empty").getValue("artifacts").jsonArray.toList(),
            )
        }

    @Test
    fun `the form opens a task with a type this app does not know without breaking, and keeps the link as it was`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-future", noContent())
            val viewModel = newViewModel("task-future").opened()

            assertEquals(listOf("doc-note", "doc-future", "doc-future-bare"), ids(viewModel))
            assertEquals(
                listOf(ArtifactType.Text, ArtifactType.Unknown, ArtifactType.Unknown),
                viewModel.draft.artifacts.map { it.type },
            )
            viewModel.removeArtifact("doc-note")
            viewModel.save()
            viewModel.state.first { (it as? TaskEditUiState.Form)?.done == true }

            assertEquals(
                listOf(link("doc-future", "uses"), link("doc-future-bare", "creates")),
                patchBody("task-future").getValue("artifacts").jsonArray.toList(),
            )
        }

    @Test
    fun `a meal offers global then own foods and a chosen food is a copy with a quantity that Save trims`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-meal-empty", noContent())
            val viewModel = newViewModel("task-meal-empty").opened()

            viewModel.openArtifactPicker()
            val picker = viewModel.picker()
            assertEquals(listOf("food-global", "food-global-2", "food-own", "food-copy-1"), picker.search.results.map { it.id })
            viewModel.artifactPicker.pick(picker.search.results.first { it.id == "food-global" })
            val copy = viewModel.draft.artifacts.single()
            assertEquals("food-global", copy.copyOf)
            assertEquals(TaskKind.Meal, viewModel.draft.kind)

            viewModel.setArtifactQuantity(copy.id, " 2 fatias ")
            viewModel.save()
            viewModel.state.first { (it as? TaskEditUiState.Form)?.done == true }

            assertEquals(
                buildJsonObject {
                    put("expectedRevision", 2)
                    put(
                        "artifacts",
                        JsonArray(
                            listOf(
                                buildJsonObject {
                                    put("copyOf", "food-global")
                                    put("quantity", "2 fatias")
                                },
                            ),
                        ),
                    )
                },
                patchBody("task-meal-empty"),
            )
        }

    @Test
    fun `the same food can be added twice, each copy with its own quantity, and existing foods keep theirs`() =
        runTest {
            val viewModel = newViewModel("task-meal").opened()
            assertEquals(
                "150 g",
                viewModel.draft.artifacts
                    .first()
                    .quantity,
            )

            viewModel.openArtifactPicker()
            viewModel.artifactPicker.pick(
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "food-global" },
            )
            viewModel.openArtifactPicker()
            viewModel.artifactPicker.pick(
                viewModel
                    .picker()
                    .search.results
                    .first { it.id == "food-global" },
            )
            val copies = viewModel.draft.artifacts.filter { it.copyOf != null }
            assertEquals(2, copies.size)
            assertFalse(copies[0].id == copies[1].id)

            // A quantidade de um alimento que já estava na tarefa não muda por aqui.
            viewModel.setArtifactQuantity("food-copy-1", "999 g")
            assertEquals(
                "150 g",
                viewModel.draft.artifacts
                    .first()
                    .quantity,
            )
            viewModel.setArtifactQuantity(copies[1].id, "1 un")
            assertEquals(
                listOf(null, "1 un"),
                viewModel.draft.artifacts
                    .filter { it.copyOf != null }
                    .map { it.quantity },
            )
        }

    @Test
    fun `a training offers the global exercises by reference`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-training", noContent())
            val viewModel = newViewModel("task-training").opened()

            viewModel.openArtifactPicker()
            val picker = viewModel.picker()
            assertEquals(listOf("ex-bench"), picker.search.results.map { it.id })
            viewModel.artifactPicker.pick(picker.search.results.single())
            viewModel.save()
            viewModel.state.first { (it as? TaskEditUiState.Form)?.done == true }

            assertEquals(
                listOf(link("doc-training", "creates"), link("ex-run", "uses"), link("ex-bench", "uses")),
                patchBody("task-training").getValue("artifacts").jsonArray.toList(),
            )
        }

    @Test
    fun `changing the kind in the draft changes what the plus offers`() =
        runTest {
            val viewModel = newViewModel("task-common-empty").opened()

            viewModel.update { it.copy(kind = TaskKind.Training) }
            viewModel.openArtifactPicker()

            assertEquals("Exercícios", viewModel.picker().source.title)
        }

    @Test
    fun `a stale save rereads the task and keeps the list that was edited`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-common", MockResponse().setResponseCode(409).setBody("{}"))
            val viewModel = newViewModel("task-common").opened()
            viewModel.removeArtifact("doc-skill")

            viewModel.save()
            val warned = viewModel.state.first { (it as? TaskEditUiState.Form)?.failure != null } as TaskEditUiState.Form

            assertEquals(STALE_FORM_NOTICE, warned.failure)
            assertEquals(listOf("doc-note", "doc-router", "doc-sleep"), warned.draft.artifacts.map { it.id })
        }
}
