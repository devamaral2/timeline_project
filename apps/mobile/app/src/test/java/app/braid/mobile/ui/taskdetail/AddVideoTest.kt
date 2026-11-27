package app.braid.mobile.ui.taskdetail

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.transcription.DefaultTranscriptionRepository
import app.braid.mobile.data.transcription.TranscriptionApi
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.domain.transcription.TranscriptionText
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
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** "Adicionar vídeo" no detalhe da Leitura diária: abre o campo do link e cria o pedido de transcrição. */
@OptIn(ExperimentalCoroutinesApi::class)
class AddVideoTest {
    private val video = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    private val taskPath = "/api/tasks/task-leitura"
    private val transcriptionPath = "/api/tasks/transcription-requests"

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val created = mutableListOf<TaskDetailViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        backend.route("GET", taskPath, fixture("task-detail-daily-reading"), fixture("task-detail-daily-reading-reloaded"))
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private suspend fun newViewModel(id: String = "task-leitura"): TaskDetailViewModel {
        val viewModel =
            TaskDetailViewModel(
                SavedStateHandle(mapOf("taskId" to id)),
                DefaultTaskDetailRepository(graph.apis.create(TaskDetailApi::class.java)),
                AppClock { Instant.parse("2026-09-14T14:00:00.000Z") },
                DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)),
                DefaultTranscriptionRepository(graph.apis.create(TranscriptionApi::class.java)),
            ).also(created::add)
        viewModel.state.first { it is TaskDetailUiState.Content }
        return viewModel
    }

    private suspend fun AddVideoForm.until(predicate: (AddVideoState) -> Boolean): AddVideoState =
        withContext(Dispatchers.Default) { withTimeout(10_000) { state.first(predicate) } }

    @Test
    fun `the daily reading offers to add a video and any other task does not`() =
        runTest {
            val reading = newViewModel()
            assertTrue((reading.state.value as TaskDetailUiState.Content).task.isDailyReading)

            backend.route("GET", "/api/tasks/task-1", fixture("task-detail-person"))
            val other = newViewModel("task-1")
            assertFalse((other.state.value as TaskDetailUiState.Content).task.isDailyReading)
        }

    @Test
    fun `the button opens the link field and cancel closes it without asking anything`() =
        runTest {
            val form = newViewModel().addVideo
            assertFalse(form.state.value.open)

            form.show()
            form.type("https://youtu.be/dQw4w9WgXcQ")
            assertTrue(form.state.value.open)
            assertEquals("https://youtu.be/dQw4w9WgXcQ", form.state.value.link)

            form.hide()
            assertEquals(AddVideoState(), form.state.value)
            assertEquals(0, backend.requestsTo("POST", transcriptionPath).size)
        }

    @Test
    fun `a video link creates the request, says it joined the queue and rereads the task`() =
        runTest {
            backend.route("POST", transcriptionPath, fixture("transcription-request-created"))
            val viewModel = newViewModel()
            val form = viewModel.addVideo

            form.show()
            form.type("  $video  ")
            form.submit()
            val done = form.until { it.notice != null }

            assertEquals(TranscriptionText.FORM_QUEUED, done.notice)
            assertFalse(done.open)
            assertEquals("", done.link)
            assertNull(done.error)
            val sent = backend.requestsTo("POST", transcriptionPath).single()
            assertEquals(
                Json.parseToJsonElement("""{"url":"$video"}"""),
                Json.parseToJsonElement(sent.body.readUtf8()),
            )
            val reread =
                viewModel.state.first {
                    it is TaskDetailUiState.Content && it.task.card.revision == 4
                } as TaskDetailUiState.Content
            assertEquals(4, reread.task.card.revision)
            assertEquals(2, backend.requestsTo("GET", taskPath).size)
        }

    @Test
    fun `asking again for the same video says it was already in the queue`() =
        runTest {
            backend.route("POST", transcriptionPath, fixture("transcription-request-again"))
            val form = newViewModel().addVideo
            form.show()
            form.type(video)
            form.submit()

            assertEquals(TranscriptionText.ALREADY_QUEUED, form.until { it.notice != null }.notice)
        }

    @Test
    fun `a link that is not a YouTube video is refused with a clear notice without calling the API`() =
        runTest {
            val form = newViewModel().addVideo
            for (link in listOf(
                "https://www.youtube.com/@canal",
                "https://www.youtube.com/playlist?list=PL123",
                "https://exemplo.dev/video",
                "isto não é um link",
                "",
            )) {
                form.show()
                form.type(link)
                form.submit()

                val state = form.state.value
                assertEquals(link, TranscriptionText.INVALID_LINK, state.error)
                assertTrue(link, state.open)
                assertEquals(link, link, state.link)
            }
            assertEquals(0, backend.requestsTo("POST", transcriptionPath).size)
        }

    @Test
    fun `typing again clears the invalid link notice`() =
        runTest {
            val form = newViewModel().addVideo
            form.show()
            form.type("https://www.youtube.com/@canal")
            form.submit()
            assertEquals(TranscriptionText.INVALID_LINK, form.state.value.error)

            form.type("https://youtu.be/dQw4w9WgXcQ")
            assertNull(form.state.value.error)
        }

    @Test
    fun `the API refusing the link shows the same notice, and a network failure asks to try again keeping the link`() =
        runTest {
            backend.route("POST", transcriptionPath, status(400), status(500))
            val form = newViewModel().addVideo
            form.show()
            form.type(video)
            form.submit()
            assertEquals(TranscriptionText.INVALID_LINK, form.until { it.error != null }.error)

            form.submit()
            assertEquals(TranscriptionText.FORM_FAILED, form.until { it.error == TranscriptionText.FORM_FAILED }.error)
            assertEquals(video, form.state.value.link)
            assertTrue(form.state.value.open)
            assertFalse(form.state.value.busy)
            assertEquals(1, backend.requestsTo("GET", taskPath).size)
        }
}
