package app.braid.mobile.ui.chat

import app.braid.mobile.data.chat.DefaultChatRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.data.transcription.DefaultTranscriptionRepository
import app.braid.mobile.data.transcription.TranscriptionApi
import app.braid.mobile.domain.chat.ChatAgent
import app.braid.mobile.domain.chat.ChatFailureCode
import app.braid.mobile.domain.chat.ChatPolling
import app.braid.mobile.domain.chat.ModelSelector
import app.braid.mobile.domain.chat.chatFailureText
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.domain.transcription.TranscriptionText
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.InMemoryModelSelectionStore
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.stopAndJoin
import app.cash.turbine.test
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
import java.util.concurrent.TimeUnit

/** Uma mensagem que é só um link de vídeo do YouTube vai direto ao pedido de transcrição, antes do agente de roteamento. */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatTranscriptionTest {
    private val video = "https://youtu.be/dQw4w9WgXcQ"
    private val transcriptionPath = "/api/tasks/transcription-requests"
    private val requestsPath = "/api/requests"
    private val now = Instant.parse("2026-09-14T14:00:00.000Z")

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val created = mutableListOf<ChatViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        graph.storage.session = StoredSession("access", "refresh", "user-1", "ana@example.com", "Ana")
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private suspend fun newViewModel(): ChatViewModel {
        graph.sessionRepository.restore()
        val chat = DefaultChatRepository(graph.apis.create(RequestsApi::class.java))
        val transcription = DefaultTranscriptionRepository(graph.apis.create(TranscriptionApi::class.java))
        return ChatViewModel(
            chat,
            graph.sessionRepository,
            AppClock {
                now
            },
            ChatPolling(),
            ModelSelector(chat, InMemoryModelSelectionStore()),
            transcription,
        ).also { created += it }
            .also { it.state.first { state -> state.ready } }
    }

    private suspend fun ChatViewModel.until(predicate: (ChatUiState) -> Boolean): ChatUiState =
        withContext(Dispatchers.Default) { withTimeout(10_000) { state.first(predicate) } }

    private fun serveQueued() = backend.route("POST", transcriptionPath, fixture("transcription-request-created"))

    @Test
    fun `a message that is only a video link asks for the transcription and says the video joined the queue`() =
        runTest {
            serveQueued()
            val chat = newViewModel()

            assertTrue(chat.send("  $video  "))
            val done = chat.until { it.pending == null && it.messages.size == 2 }

            val sent = backend.requestsTo("POST", transcriptionPath).single()
            assertEquals(
                Json.parseToJsonElement(Fixtures.text("transcription-request-body")),
                Json.parseToJsonElement(sent.body.readUtf8()),
            )
            assertEquals(0, backend.requestsTo("POST", requestsPath).size)
            val answer = done.messages[1] as ChatMessage.Assistant
            assertEquals(TranscriptionText.CHAT_QUEUED, answer.text)
            assertEquals(
                listOf(RequestEntity(EntityKind.Task, "task-leitura", "Leitura diária", null, RequestOperation.Update)),
                answer.entities,
            )
            assertTrue(done.turns.isEmpty())
        }

    @Test
    fun `the status line says what is happening while the request is saved`() =
        runTest {
            backend.route("POST", transcriptionPath, fixture("transcription-request-created").setBodyDelay(300, TimeUnit.MILLISECONDS))
            val chat = newViewModel()

            chat.send(video)
            val saving = chat.until { it.pending != null }
            assertEquals(TranscriptionText.CHAT_PENDING, saving.pending?.label)
            assertNull(saving.pending?.requestId)

            chat.until { it.pending == null }
        }

    @Test
    fun `the agenda is told that the reading changed`() =
        runTest {
            serveQueued()
            val chat = newViewModel()
            chat.entitiesChanged.test {
                chat.send(video)
                chat.until { it.pending == null && it.messages.size == 2 }
                awaitItem()
            }
        }

    @Test
    fun `asking again for the same video says it was already in the queue`() =
        runTest {
            backend.route("POST", transcriptionPath, fixture("transcription-request-created"), fixture("transcription-request-again"))
            val chat = newViewModel()

            chat.send(video)
            chat.until { it.pending == null && it.messages.size == 2 }
            chat.send(video)
            val second = chat.until { it.pending == null && it.messages.size == 4 }

            assertEquals(TranscriptionText.ALREADY_QUEUED, (second.messages[3] as ChatMessage.Assistant).text)
        }

    @Test
    fun `a link inside a sentence, or a channel link, goes to the agent as any message`() =
        runTest {
            backend.route("POST", requestsPath, fixture("chat-accepted", 202))
            backend.route("GET", "$requestsPath/R00000000000000000000000A1", fixture("chat-request-done"))
            val chat = newViewModel()

            chat.send("resuma $video")
            chat.until { it.pending == null && it.messages.size == 2 }
            chat.send("https://www.youtube.com/@canal")
            chat.until { it.pending == null && it.messages.size == 4 }

            assertEquals(2, backend.requestsTo("POST", requestsPath).size)
            assertEquals(0, backend.requestsTo("POST", transcriptionPath).size)
        }

    @Test
    fun `in Hermes mode a link alone also asks for the transcription, not the Hermes`() =
        runTest {
            serveQueued()
            val chat = newViewModel()
            chat.send("/hermes")
            chat.until { it.agentMode == ChatAgent.Hermes }

            chat.send(video)
            val done = chat.until { it.pending == null && it.messages.any { m -> m.id.endsWith("-transcription") } }

            assertEquals(1, backend.requestsTo("POST", transcriptionPath).size)
            assertEquals(0, backend.requestsTo("POST", "$requestsPath/hermes").size)
            assertEquals(ChatAgent.Hermes, done.agentMode)
            assertEquals(TranscriptionText.CHAT_QUEUED, (done.messages.last() as ChatMessage.Assistant).text)
        }

    @Test
    fun `in model mode a link alone also asks for the transcription, not the model`() =
        runTest {
            backend.route("GET", "$requestsPath/model/options", fixture("chat-model-options"))
            serveQueued()
            val chat = newViewModel()
            chat.send("/modelo")
            chat.until { it.agentMode == ChatAgent.Model && it.pending == null }

            chat.send(video)
            val done = chat.until { it.pending == null && it.messages.any { m -> m.id.endsWith("-transcription") } }

            assertEquals(1, backend.requestsTo("POST", transcriptionPath).size)
            assertEquals(0, backend.requestsTo("POST", "$requestsPath/model").size)
            assertEquals(ChatAgent.Model, done.agentMode)
            assertEquals(TranscriptionText.CHAT_QUEUED, (done.messages.last() as ChatMessage.Assistant).text)
        }

    @Test
    fun `in Hermes mode a link inside a sentence still goes to the Hermes`() =
        runTest {
            backend.route("POST", "$requestsPath/hermes", fixture("chat-hermes-accepted", 202))
            backend.route("GET", "$requestsPath/R00000000000000000000000A1", fixture("chat-hermes-done"))
            val chat = newViewModel()
            chat.send("/hermes")
            chat.until { it.agentMode == ChatAgent.Hermes }

            chat.send("resuma $video")
            chat.until { it.pending == null && it.messages.any { m -> m.id.endsWith("-answer") } }

            assertEquals(1, backend.requestsTo("POST", "$requestsPath/hermes").size)
            assertEquals(0, backend.requestsTo("POST", transcriptionPath).size)
        }

    @Test
    fun `the API refusing the link shows a clear notice, and retry asks again`() =
        runTest {
            backend.route("POST", transcriptionPath, status(400), fixture("transcription-request-created"))
            val chat = newViewModel()
            chat.send(video)

            val failed = chat.until { it.messages.lastOrNull() is ChatMessage.Error }
            val error = failed.messages.last() as ChatMessage.Error
            assertEquals(TranscriptionText.INVALID_LINK, error.text)
            assertEquals(video, error.retryText)
            assertNull(failed.pending)
            assertTrue((failed.messages.first() as ChatMessage.User).failed)

            chat.retry(error.id)
            val retried = chat.until { it.pending == null && it.messages.lastOrNull() is ChatMessage.Assistant }
            assertEquals(TranscriptionText.CHAT_QUEUED, (retried.messages.last() as ChatMessage.Assistant).text)
            assertEquals(2, backend.requestsTo("POST", transcriptionPath).size)
            assertFalse((retried.messages.first() as ChatMessage.User).failed)
        }

    @Test
    fun `a server failure shows the connection text`() =
        runTest {
            backend.route("POST", transcriptionPath, status(500))
            val chat = newViewModel()
            chat.send(video)

            val failed = chat.until { it.messages.lastOrNull() is ChatMessage.Error }
            assertEquals(chatFailureText(ChatFailureCode.ConnectionFailed), (failed.messages.last() as ChatMessage.Error).text)
        }
}
