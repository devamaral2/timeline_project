package app.braid.mobile.ui.search

import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.data.tasks.DefaultTaskPickerRepository
import app.braid.mobile.data.tasks.TaskPickerApi
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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/** A pesquisa do chat pela rede: as tarefas acompanhadas e os artefatos, filtrados pelo texto. */
@OptIn(ExperimentalCoroutinesApi::class)
class SearchViewModelTest {
    private val trackedPath = "/api/tasks/tracked"
    private val artifactsPath = "/api/artifacts"

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val created = mutableListOf<SearchViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        graph.storage.session = StoredSession("access", "refresh", userId = "user-7", email = "a@b.c", name = "Ana")
        backend.route("GET", trackedPath, fixture("task-hierarchy-tracked"))
        backend.route("GET", artifactsPath, fixture("documents-list"))
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private suspend fun newViewModel(): SearchViewModel {
        graph.sessionRepository.restore()
        return SearchViewModel(
            DefaultTaskPickerRepository(graph.apis.create(TaskPickerApi::class.java)),
            DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)),
        ).also(created::add)
    }

    private suspend fun SearchViewModel.ready() = state.first { it.status == PickerSearchStatus.Ready }

    @Test
    fun `without text it lists the first tasks, then the first documents`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.start("")

            val state = viewModel.ready()

            val kinds = state.results.map { it::class }
            assertEquals(SearchResult.Task::class, kinds.first())
            assertEquals(SearchResult.Document::class, kinds.last())
            assertEquals(7, state.results.count { it is SearchResult.Task })
            assertEquals("Planejar a viagem", (state.results.first() as SearchResult.Task).card.name)
            assertEquals("", state.query)
            val tracked = backend.requestsTo("GET", trackedPath).last()
            assertEquals("50", tracked.requestUrl?.queryParameter("limit"))
            assertEquals(null, tracked.requestUrl?.queryParameter("q"))
            val documents = backend.requestsTo("GET", artifactsPath).last()
            assertEquals("50", documents.requestUrl?.queryParameter("limit"))
            assertEquals(null, documents.requestUrl?.queryParameter("q"))
        }

    @Test
    fun `the text after the command searches both lists at once`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.start("  viagem ")

            val state = viewModel.state.first { it.query == "viagem" && it.status == PickerSearchStatus.Ready }

            assertEquals("  viagem ", state.typed)
            assertEquals(
                "viagem",
                backend
                    .requestsTo("GET", trackedPath)
                    .last()
                    .requestUrl
                    ?.queryParameter("q"),
            )
            assertEquals(
                "viagem",
                backend
                    .requestsTo("GET", artifactsPath)
                    .last()
                    .requestUrl
                    ?.queryParameter("q"),
            )
        }

    @Test
    fun `a failed list shows the failure instead of half the results`() =
        runTest {
            backend.route("GET", artifactsPath, status(500))
            val viewModel = newViewModel()
            viewModel.start("")

            val state = viewModel.state.first { it.status == PickerSearchStatus.Failed }

            assertEquals(PickerSearchStatus.Failed, state.status)
        }

    private fun documentKinds(results: List<SearchResult>) =
        results.filterIsInstance<SearchResult.Document>().associate { it.artifact.name to searchKindLabel(it) }

    @Test
    fun `the new types appear among the results with the type label`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.start("")

            val kinds = documentKinds(viewModel.ready().results)

            assertEquals("Artefato · Notícias", kinds["Notícias da manhã"])
            assertEquals("Artefato · Resumo de e-mail", kinds["Resumo da caixa de entrada"])
            assertEquals("Artefato · Transcrição", kinds["Aula de jardinagem"])
            assertEquals("Artefato · Nota", kinds["Ideias para o projeto"])
        }

    @Test
    fun `an unknown type is a result too, with the generic label`() =
        runTest {
            backend.route("GET", artifactsPath, fixture("documents-list-unknown"))
            val viewModel = newViewModel()
            viewModel.start("")

            val kinds = documentKinds(viewModel.ready().results)

            assertEquals("Artefato · Artefato", kinds["Mapa do futuro"])
            assertEquals("Artefato · Artefato", kinds["Projeção sem texto"])
            assertEquals("Artefato · Notícias", kinds["Notícias da manhã"])
            assertEquals("Tarefa", searchKindLabel(viewModel.ready().results.first()))
        }
}
