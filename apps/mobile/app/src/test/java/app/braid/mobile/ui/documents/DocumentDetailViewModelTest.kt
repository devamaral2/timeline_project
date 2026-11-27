package app.braid.mobile.ui.documents

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.domain.artifact.FoodGeneration
import app.braid.mobile.domain.artifact.UnknownData
import app.braid.mobile.domain.artifact.artifactTypeLabel
import app.braid.mobile.domain.artifact.markdownBodyOf
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
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
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class DocumentDetailViewModelTest {
    private val now = Instant.parse("2026-09-14T15:00:00.000Z")
    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val created = mutableListOf<DocumentDetailViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(id: String): DocumentDetailViewModel =
        DocumentDetailViewModel(
            SavedStateHandle(mapOf("documentId" to id)),
            DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)),
            AppClock { now },
        ).also(created::add)

    private suspend fun DocumentDetailViewModel.settled(): DocumentDetailUiState = state.first { it !is DocumentDetailUiState.Loading }

    private fun reads(id: String): Int = backend.requestsTo("GET", "/api/artifacts/$id").size

    private suspend fun awaitReads(
        id: String,
        count: Int,
    ) = withContext(Dispatchers.Default) { withTimeout(5_000) { while (reads(id) < count) delay(5) } }

    @Test
    fun `it opens loading, then shows the document with its tasks`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            val viewModel = newViewModel("doc-text")

            val ready = viewModel.settled() as DocumentDetailUiState.Ready

            assertEquals("Ideias para o projeto", ready.artifact.name)
            assertEquals(listOf("task-1", "task-3"), ready.artifact.tasks.map { it.taskId })
            assertTrue(ready.showsTasks)
            assertEquals(now, ready.now)
        }

    @Test
    fun `the new types open with label, markdown, tags and tasks, and are edited as text`() =
        runTest {
            for (
            (id, fixtureName, type, label) in
            listOf(
                NewTypeCase("doc-news", "documents-detail-news", ArtifactType.News, "Notícias"),
                NewTypeCase("doc-email", "documents-detail-email-summary", ArtifactType.EmailSummary, "Resumo de e-mail"),
                NewTypeCase("doc-youtube", "documents-detail-youtube-transcript", ArtifactType.YoutubeTranscript, "Transcrição"),
            )
            ) {
                backend.route("GET", "/api/artifacts/$id", fixture(fixtureName))
                val ready = newViewModel(id).settled() as DocumentDetailUiState.Ready

                assertEquals(type, ready.artifact.type)
                assertEquals(label, artifactTypeLabel(ready.artifact.type))
                assertTrue(markdownBodyOf(ready.artifact).isNotEmpty())
                assertTrue(ready.canEdit)
                assertEquals(EditEntityType.Text, ready.editType)
            }
            backend.route("GET", "/api/artifacts/doc-news", fixture("documents-detail-news"))
            val news = (newViewModel("doc-news").settled() as DocumentDetailUiState.Ready).artifact
            assertEquals(listOf("leitura"), news.tags)
            assertEquals("- [Chuva no fim de semana](https://example.com/chuva)", markdownBodyOf(news))
        }

    @Test
    fun `a global document of a new type offers no edit, delete or AI box`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-news-global", fixture("documents-detail-news-global"))

            val ready = newViewModel("doc-news-global").settled() as DocumentDetailUiState.Ready

            assertEquals(ArtifactType.News, ready.artifact.type)
            assertFalse(ready.canEdit)
            assertNull(ready.editType)
        }

    @Test
    fun `the AI box of the three new types uses the artifact target, and the router and the exercise have none`() =
        runTest {
            listOf(
                "doc-news" to "documents-detail-news",
                "doc-email" to "documents-detail-email-summary",
                "doc-youtube" to "documents-detail-youtube-transcript",
                "doc-text" to "documents-detail-text",
            ).forEach { (id, detail) ->
                backend.route("GET", "/api/artifacts/$id", fixture(detail))
                val type = (newViewModel(id).settled() as DocumentDetailUiState.Ready).editType
                assertEquals(id, "artifact", type?.code)
            }
            backend.route("GET", "/api/artifacts/doc-router", fixture("documents-detail-router"))
            backend.route("GET", "/api/artifacts/doc-workout", fixture("documents-detail-workout"))

            assertNull((newViewModel("doc-router").settled() as DocumentDetailUiState.Ready).editType)
            assertNull((newViewModel("doc-workout").settled() as DocumentDetailUiState.Ready).editType)
        }

    @Test
    fun `deleting news, an email summary or a transcript asks first, sends DELETE and marks it as gone`() =
        runTest {
            listOf(
                "doc-news" to "documents-detail-news",
                "doc-email" to "documents-detail-email-summary",
                "doc-youtube" to "documents-detail-youtube-transcript",
            ).forEach { (id, detail) ->
                backend.route("GET", "/api/artifacts/$id", fixture(detail))
                backend.route("DELETE", "/api/artifacts/$id", MockResponse().setResponseCode(204))
                val viewModel = newViewModel(id)
                viewModel.settled()

                viewModel.askDelete()
                assertTrue((viewModel.state.value as DocumentDetailUiState.Ready).delete.open)
                assertTrue(backend.requestsTo("DELETE", "/api/artifacts/$id").isEmpty())

                viewModel.confirmDelete()
                val done = viewModel.awaitDeleteDone() as DocumentDetailUiState.Ready

                assertTrue(done.deleted)
                assertEquals(1, backend.requestsTo("DELETE", "/api/artifacts/$id").size)
            }
        }

    @Test
    fun `an unknown type cannot be deleted from the app`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-future", fixture("documents-detail-unknown"))
            val viewModel = newViewModel("doc-future")
            viewModel.settled()

            viewModel.confirmDelete()

            assertTrue(backend.requestsTo("DELETE", "/api/artifacts/doc-future").isEmpty())
        }

    @Test
    fun `an unknown type with a body shows it as text but cannot be edited, by hand or by AI`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-future", fixture("documents-detail-unknown"))

            val ready = newViewModel("doc-future").settled() as DocumentDetailUiState.Ready

            assertEquals(ArtifactType.Unknown, ready.artifact.type)
            assertEquals("Artefato", artifactTypeLabel(ready.artifact.type))
            assertEquals("Texto de um tipo que este app não conhece.", markdownBodyOf(ready.artifact))
            assertEquals(listOf("novo"), ready.artifact.tags)
            assertTrue(ready.showsTasks)
            assertFalse(ready.canEdit)
            assertNull(ready.editType)
        }

    @Test
    fun `an unknown type without a body shows only the name`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-future-bare", fixture("documents-detail-unknown-no-body"))

            val ready = newViewModel("doc-future-bare").settled() as DocumentDetailUiState.Ready

            assertEquals("Projeção sem texto", ready.artifact.name)
            assertEquals(UnknownData, ready.artifact.data)
            assertEquals("", markdownBodyOf(ready.artifact))
            assertFalse(ready.canEdit)
            assertNull(ready.editType)
        }

    private data class NewTypeCase(
        val id: String,
        val fixture: String,
        val type: ArtifactType,
        val label: String,
    )

    @Test
    fun `a global document hides its tasks and has no actions`() =
        runTest {
            backend.route("GET", "/api/artifacts/g", fixture("documents-detail-text-global"))

            val ready = newViewModel("g").settled() as DocumentDetailUiState.Ready

            assertTrue(ready.artifact.global)
            assertFalse(ready.showsTasks)
            assertFalse(ready.canEdit)
        }

    @Test
    fun `only the person's own text document can be edited`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            backend.route("GET", "/api/artifacts/doc-food", fixture("documents-detail-food"))

            assertTrue((newViewModel("doc-text").settled() as DocumentDetailUiState.Ready).canEdit)
            assertFalse((newViewModel("doc-food").settled() as DocumentDetailUiState.Ready).canEdit)
        }

    @Test
    fun `the AI edit bar follows the document, so the global ones have none`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            backend.route("GET", "/api/artifacts/doc-food", fixture("documents-detail-food"))
            backend.route("GET", "/api/artifacts/doc-global", fixture("documents-detail-text-global"))

            assertEquals(EditEntityType.Text, (newViewModel("doc-text").settled() as DocumentDetailUiState.Ready).editType)
            assertEquals(EditEntityType.Food, (newViewModel("doc-food").settled() as DocumentDetailUiState.Ready).editType)
            assertNull((newViewModel("doc-global").settled() as DocumentDetailUiState.Ready).editType)
        }

    @Test
    fun `refresh reads the document again without going back to loading, and a failed read keeps what is on screen`() =
        runTest {
            val bodies = ArrayDeque(listOf("documents-detail-food-pending", "documents-detail-food-done"))
            var broken = false
            backend.route("GET", "/api/artifacts/doc-food") {
                if (broken) status(503) else fixture(if (bodies.size > 1) bodies.removeFirst() else bodies.first())
            }
            val viewModel = newViewModel("doc-food")
            assertTrue((viewModel.settled() as DocumentDetailUiState.Ready).pendingMeal)

            viewModel.refresh()
            awaitReads("doc-food", 2)
            val after = viewModel.state.first { (it as? DocumentDetailUiState.Ready)?.pendingMeal == false } as DocumentDetailUiState.Ready
            assertNull((after.artifact.data as FoodData).generation)

            broken = true
            viewModel.refresh()
            awaitReads("doc-food", 3)
            withContext(Dispatchers.Default) { delay(100) }
            assertTrue(viewModel.state.value is DocumentDetailUiState.Ready)
        }

    @Test
    fun `a missing or foreign document is not found, and any other failure is an error`() =
        runTest {
            backend.route("GET", "/api/artifacts/gone", status(404))
            backend.route("GET", "/api/artifacts/theirs", status(403))
            backend.route("GET", "/api/artifacts/broken", status(500))

            assertEquals(DocumentDetailUiState.Missing, newViewModel("gone").settled())
            assertEquals(DocumentDetailUiState.Missing, newViewModel("theirs").settled())
            assertEquals(DocumentDetailUiState.Error, newViewModel("broken").settled())
        }

    @Test
    fun `retrying after an error reads again`() =
        runTest {
            var broken = true
            backend.route("GET", "/api/artifacts/doc-text") { if (broken) status(500) else fixture("documents-detail-text") }
            val viewModel = newViewModel("doc-text")
            assertEquals(DocumentDetailUiState.Error, viewModel.settled())

            broken = false
            viewModel.retry()

            assertTrue(viewModel.state.first { it is DocumentDetailUiState.Ready } is DocumentDetailUiState.Ready)
        }

    @Test
    fun `a food being calculated is re-read every 1,5 seconds while visible, until it is done`() =
        runTest {
            backend.route(
                "GET",
                "/api/artifacts/doc-food-pending",
                fixture("documents-detail-food-pending"),
                fixture("documents-detail-food-pending"),
                fixture("documents-detail-food-done"),
            )
            val viewModel = newViewModel("doc-food-pending")
            viewModel.setVisible(true)
            val first = viewModel.settled() as DocumentDetailUiState.Ready
            assertTrue(first.pendingMeal)
            assertEquals(FoodGeneration.Pending, (first.artifact.data as FoodData).generation)

            advanceTimeBy(1_499)
            runCurrent()
            assertEquals(1, reads("doc-food-pending"))

            advanceTimeBy(1)
            runCurrent()
            awaitReads("doc-food-pending", 2)
            advanceTimeBy(1_500)
            runCurrent()
            awaitReads("doc-food-pending", 3)
            val done = viewModel.state.first { (it as? DocumentDetailUiState.Ready)?.pendingMeal == false } as DocumentDetailUiState.Ready
            assertNull((done.artifact.data as FoodData).generation)

            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(3, reads("doc-food-pending"))
        }

    @Test
    fun `it does not poll out of sight, and a read that fails keeps the text on screen`() =
        runTest {
            var broken = false
            backend.route("GET", "/api/artifacts/doc-food-pending") {
                if (broken) status(503) else fixture("documents-detail-food-pending")
            }
            val viewModel = newViewModel("doc-food-pending")
            viewModel.settled()
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(1, reads("doc-food-pending"))

            viewModel.setVisible(true)
            broken = true
            advanceTimeBy(1_500)
            runCurrent()
            awaitReads("doc-food-pending", 2)
            withContext(Dispatchers.Default) { delay(100) }
            assertTrue((viewModel.state.value as DocumentDetailUiState.Ready).pendingMeal)

            viewModel.setVisible(false)
            val whenLeft = reads("doc-food-pending")
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(whenLeft, reads("doc-food-pending"))
        }

    @Test
    fun `a food that failed to calculate does not poll`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-food-pending", fixture("documents-detail-food-failed"))
            val viewModel = newViewModel("doc-food-pending")
            viewModel.setVisible(true)
            val ready = viewModel.settled() as DocumentDetailUiState.Ready

            advanceTimeBy(60_000)
            runCurrent()

            assertFalse(ready.pendingMeal)
            assertEquals(1, reads("doc-food-pending"))
        }

    private fun newOwnTextViewModel(): DocumentDetailViewModel {
        backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
        return newViewModel("doc-text")
    }

    private suspend fun DocumentDetailViewModel.awaitDeleteDone() =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) {
                state.first {
                    (it as? DocumentDetailUiState.Ready)?.let { ready ->
                        ready.deleted ||
                            ready.delete.error != null
                    } ==
                        true
                }
            }
        }

    @Test
    fun `deleting asks first, then sends DELETE and marks the document as gone`() =
        runTest {
            backend.route("DELETE", "/api/artifacts/doc-text", MockResponse().setResponseCode(204))
            val viewModel = newOwnTextViewModel()
            viewModel.settled()

            viewModel.askDelete()
            assertTrue((viewModel.state.value as DocumentDetailUiState.Ready).delete.open)
            assertTrue(backend.requestsTo("DELETE", "/api/artifacts/doc-text").isEmpty())

            viewModel.confirmDelete()
            val done = viewModel.awaitDeleteDone() as DocumentDetailUiState.Ready

            assertTrue(done.deleted)
            assertEquals(1, backend.requestsTo("DELETE", "/api/artifacts/doc-text").size)
        }

    @Test
    fun `cancelling the confirmation sends nothing`() =
        runTest {
            val viewModel = newOwnTextViewModel()
            viewModel.settled()

            viewModel.askDelete()
            viewModel.dismissDelete()

            assertFalse((viewModel.state.value as DocumentDetailUiState.Ready).delete.open)
            assertTrue(backend.requestsTo("DELETE", "/api/artifacts/doc-text").isEmpty())
        }

    @Test
    fun `a failed delete keeps the document and shows the web message`() =
        runTest {
            backend.route("DELETE", "/api/artifacts/doc-text", status(500))
            val viewModel = newOwnTextViewModel()
            viewModel.settled()
            viewModel.askDelete()
            viewModel.confirmDelete()

            val failed = viewModel.awaitDeleteDone() as DocumentDetailUiState.Ready

            assertFalse(failed.deleted)
            assertEquals("Não foi possível excluir a nota. Tente novamente.", failed.delete.error)
            assertTrue(failed.delete.open)
            assertFalse(failed.delete.running)
        }

    @Test
    fun `a document that is not the person's own text note cannot be deleted`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-food", fixture("documents-detail-food"))
            val viewModel = newViewModel("doc-food")
            viewModel.settled()

            viewModel.askDelete()
            viewModel.confirmDelete()
            withContext(Dispatchers.Default) { delay(100) }

            assertTrue(backend.requestsTo("DELETE", "/api/artifacts/doc-food").isEmpty())
        }
}
