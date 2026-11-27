package app.braid.mobile.ui.documents

import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.artifactTypeLabel
import app.braid.mobile.domain.executor.ViewMode
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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class DocumentsViewModelTest {
    private val path = "/api/artifacts"

    @get:Rule
    val folder = TemporaryFolder()

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private lateinit var viewModes: TestViewModes
    private val created = mutableListOf<DocumentsViewModel>()

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

    private fun newViewModel(): DocumentsViewModel =
        DocumentsViewModel(DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)), viewModes.repository).also(created::add)

    private suspend fun DocumentsViewModel.loaded(): DocumentsUiState = state.first { it.artifacts != null || it.failed }

    private fun reads(): Int = backend.requestsTo("GET", path).size

    /** Espera o servidor de teste receber [count] leituras, em tempo real: a rede não anda no relógio virtual. */
    private suspend fun awaitReads(count: Int) =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) {
                while (reads() <
                    count
                ) {
                    delay(5)
                }
            }
        }

    @Test
    fun `it reads the documents without any filter and counts them`() =
        runTest {
            backend.route("GET", path, fixture("documents-list"))
            val viewModel = newViewModel()

            assertNull(viewModel.state.value.artifacts)
            assertEquals("Artefatos", viewModel.state.value.caption)
            val state = viewModel.loaded()

            assertEquals(ArtifactType.known, state.shown!!.map { it.type })
            assertEquals("${ArtifactType.known.size} artefatos", state.caption)
            assertTrue(state.hasArtifacts)
            assertFalse(state.failed)
            assertNull(
                backend
                    .requestsTo("GET", path)
                    .single()
                    .requestUrl!!
                    .query,
            )
        }

    @Test
    fun `the executor list separates the person's documents from the agents' files without reading again`() =
        runTest {
            backend.route("GET", path, fixture("documents-list"))
            val viewModel = newViewModel()
            viewModel.loaded()

            chooseMode(viewModel, ViewMode.Human)
            assertEquals(
                listOf(
                    ArtifactType.Text,
                    ArtifactType.News,
                    ArtifactType.EmailSummary,
                    ArtifactType.YoutubeTranscript,
                    ArtifactType.Food,
                    ArtifactType.Sleep,
                    ArtifactType.Training,
                    ArtifactType.Workout,
                ),
                viewModel.state.value.shown!!
                    .map { it.type },
            )
            assertEquals("8 artefatos", viewModel.state.value.caption)

            chooseMode(viewModel, ViewMode.Agent)
            assertEquals(
                listOf(ArtifactType.Skill, ArtifactType.Agent, ArtifactType.Router),
                viewModel.state.value.shown!!
                    .map { it.type },
            )

            chooseMode(viewModel, ViewMode.All)
            assertEquals(
                ArtifactType.known.size,
                viewModel.state.value.shown!!
                    .size,
            )
            assertEquals(1, reads())
        }

    private val newTypes = listOf(ArtifactType.News, ArtifactType.EmailSummary, ArtifactType.YoutubeTranscript)

    @Test
    fun `the list shows the three new types with their own label and icon, the person's own`() =
        runTest {
            backend.route("GET", path, fixture("documents-list"))
            val viewModel = newViewModel()
            val shown = viewModel.loaded().shown!!.filter { it.type in newTypes }

            assertEquals(
                listOf("Notícias da manhã", "Resumo da caixa de entrada", "Aula de jardinagem"),
                shown.map { it.name },
            )
            assertEquals(listOf("Notícias", "Resumo de e-mail", "Transcrição"), shown.map { artifactTypeLabel(it.type) })
            assertEquals(
                listOf(DocumentIcons.newspaper, DocumentIcons.letter, DocumentIcons.youtube),
                shown.map { DocumentIcons.glyph(it.type) },
            )
            // Nenhum cai na letra da nota de texto, e os três são diferentes entre si.
            assertEquals(3, shown.map { DocumentIcons.glyph(it.type) }.distinct().size)
            assertTrue(shown.none { DocumentIcons.glyph(it.type) == DocumentIcons.letterA })

            chooseMode(viewModel, ViewMode.Human)
            assertTrue(
                viewModel.state.value.shown!!
                    .map { it.type }
                    .containsAll(newTypes),
            )
            chooseMode(viewModel, ViewMode.Agent)
            assertTrue(
                viewModel.state.value.shown!!
                    .none { it.type in newTypes },
            )
        }

    @Test
    fun `searching the artifacts finds the new types and shows them the same way`() =
        runTest {
            backend.route("GET", path) { request ->
                if (request.requestUrl!!.queryParameter("q") == null) fixture("documents-list") else fixture("documents-list-unknown")
            }
            val viewModel = newViewModel()
            viewModel.loaded()

            viewModel.search("manhã")
            advanceTimeBy(250)
            runCurrent()
            awaitReads(2)
            val state = viewModel.state.first { it.shown?.size == 4 }

            assertEquals(
                "manhã",
                backend
                    .requestsTo("GET", path)
                    .last()
                    .requestUrl!!
                    .queryParameter("q"),
            )
            assertTrue(state.filtered)
            assertEquals(ArtifactType.News, state.shown!!.last().type)
            assertEquals(DocumentIcons.newspaper, DocumentIcons.glyph(state.shown!!.last().type))
        }

    @Test
    fun `an unknown type stays on the list with the generic label and the text sheet icon`() =
        runTest {
            backend.route("GET", path, fixture("documents-list-unknown"))
            val viewModel = newViewModel()

            val state = viewModel.loaded()
            val unknown = state.shown!!.filter { it.type == ArtifactType.Unknown }

            assertEquals(4, state.shown!!.size)
            assertEquals(listOf("Mapa do futuro", "Projeção sem texto"), unknown.map { it.name })
            assertEquals(listOf("Artefato", "Artefato"), unknown.map { artifactTypeLabel(it.type) })
            assertEquals(listOf(DocumentIcons.letterA, DocumentIcons.letterA), unknown.map { DocumentIcons.glyph(it.type) })
            // O desconhecido é da pessoa: aparece em "Você", nunca em "Agentes".
            chooseMode(viewModel, ViewMode.Human)
            assertEquals(
                4,
                viewModel.state.value.shown!!
                    .size,
            )
            chooseMode(viewModel, ViewMode.Agent)
            assertTrue(
                viewModel.state.value.shown!!
                    .isEmpty(),
            )
        }

    private suspend fun chooseMode(
        viewModel: DocumentsViewModel,
        mode: ViewMode,
    ) {
        viewModes.repository.select(mode)
        viewModel.state.first { it.viewMode == mode }
    }

    @Test
    fun `typing waits 250 ms, trims, and reads with the text`() =
        runTest {
            backend.route("GET", path) { request ->
                if (request.requestUrl!!.queryParameter("q") == null) fixture("documents-list") else fixture("documents-list-filtered")
            }
            val viewModel = newViewModel()
            viewModel.loaded()

            viewModel.search("  ideias ")
            assertEquals("  ideias ", viewModel.state.value.query)
            advanceTimeBy(249)
            runCurrent()
            assertEquals(1, reads())

            advanceTimeBy(1)
            runCurrent()
            awaitReads(2)
            val state = viewModel.state.first { it.shown?.size == 1 }

            assertEquals(
                "ideias",
                backend
                    .requestsTo("GET", path)
                    .last()
                    .requestUrl!!
                    .queryParameter("q"),
            )
            assertTrue(state.filtered)
            assertEquals("1 artefato", state.caption)
            // As opções não somem quando a busca estreita o resultado.
            assertTrue(state.hasArtifacts)
        }

    @Test
    fun `typing again restarts the wait, so only the last text is read`() =
        runTest {
            backend.route("GET", path, fixture("documents-list"))
            val viewModel = newViewModel()
            viewModel.loaded()

            viewModel.search("i")
            advanceTimeBy(200)
            viewModel.search("id")
            advanceTimeBy(200)
            runCurrent()
            assertEquals(1, reads())
            advanceTimeBy(50)
            runCurrent()
            awaitReads(2)

            assertEquals(
                "id",
                backend
                    .requestsTo("GET", path)
                    .last()
                    .requestUrl!!
                    .queryParameter("q"),
            )
            assertEquals(2, reads())
        }

    @Test
    fun `a search with no match says nothing was found, and clearing it reads everything again`() =
        runTest {
            backend.route("GET", path) { request ->
                if (request.requestUrl!!.queryParameter("q") == null) fixture("documents-list") else fixture("documents-list-empty")
            }
            val viewModel = newViewModel()
            viewModel.loaded()
            viewModel.search("zzz")
            advanceTimeBy(250)
            runCurrent()
            awaitReads(2)

            val empty = viewModel.state.first { it.shown?.isEmpty() == true }
            assertEquals(EmptyKind.NothingFound, empty.empty)
            assertEquals("Nenhum artefato", empty.caption)
            assertTrue(empty.hasArtifacts)

            viewModel.clearFilters()
            awaitReads(3)
            val back = viewModel.state.first { it.shown?.isNotEmpty() == true }

            assertEquals("", back.query)
            assertFalse(back.filtered)
            assertNull(
                backend
                    .requestsTo("GET", path)
                    .last()
                    .requestUrl!!
                    .queryParameter("q"),
            )
            assertNull(back.empty)
        }

    @Test
    fun `with no documents at all it says there are none yet`() =
        runTest {
            backend.route("GET", path, fixture("documents-list-empty"))
            val viewModel = newViewModel()

            val state = viewModel.loaded()

            assertEquals(EmptyKind.NoneYet, state.empty)
            assertFalse(state.hasArtifacts)
        }

    @Test
    fun `an executor list that hides every document says nothing was found`() =
        runTest {
            backend.route("GET", path, fixture("documents-list-filtered"))
            val viewModel = newViewModel()
            viewModel.loaded()

            chooseMode(viewModel, ViewMode.Agent)

            assertEquals(EmptyKind.NothingFound, viewModel.state.value.empty)
            assertEquals("Nenhum artefato", viewModel.state.value.caption)
        }

    @Test
    fun `a failed read shows the error and trying again reads once more`() =
        runTest {
            var broken = true
            backend.route("GET", path) { if (broken) status(503) else fixture("documents-list") }
            val viewModel = newViewModel()

            val failed = viewModel.loaded()
            assertTrue(failed.failed)
            assertNull(failed.artifacts)

            broken = false
            viewModel.retry()
            val state = viewModel.state.first { it.artifacts != null }

            assertFalse(state.failed)
            assertEquals(2, reads())
        }

    @Test
    fun `coming back to the screen reads again without the skeleton`() =
        runTest {
            backend.route("GET", path, fixture("documents-list"))
            val viewModel = newViewModel()
            viewModel.loaded()

            viewModel.onResume()
            awaitReads(2)

            assertEquals(
                ArtifactType.known.size,
                viewModel.state.value.shown!!
                    .size,
            )
        }
}
