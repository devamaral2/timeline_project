package app.braid.mobile.ui.chat

import app.braid.mobile.data.chat.DefaultChatRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.domain.chat.ChatPolling
import app.braid.mobile.domain.chat.ModelSelector
import app.braid.mobile.domain.speech.SpeechError
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.FakeMicrophone
import app.braid.mobile.support.FakeSpeechRecognizer
import app.braid.mobile.support.InMemoryModelSelectionStore
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.stopAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/**
 * A voz no chat pela fronteira de rede: o ViewModel real, com Retrofit e OkHttp reais, contra o servidor de teste; só o
 * reconhecedor de voz e a permissão de microfone são trocados.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatVoiceTest {
    private val first = "R00000000000000000000000A1"
    private val requestsPath = "/api/requests"
    private val now = Instant.parse("2026-09-14T14:00:00.000Z")

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val speech = FakeSpeechRecognizer()
    private val microphone = FakeMicrophone()
    private val created = mutableListOf<ChatViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        graph.storage.session = StoredSession("access", "refresh", "user-1", "ana@example.com", "Ana")
        backend.route("POST", requestsPath, fixture("chat-accepted", 202))
        backend.route(
            "GET",
            "$requestsPath/$first",
            fixture("chat-request-queued"),
            fixture("chat-request-running"),
            fixture("chat-request-done"),
        )
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private suspend fun newViewModel(): ChatViewModel {
        graph.sessionRepository.restore()
        return chatOf().also { it.state.first { state -> state.ready } }
    }

    private fun chatOf(): ChatViewModel {
        val repository = DefaultChatRepository(graph.apis.create(RequestsApi::class.java))
        val models = ModelSelector(repository, InMemoryModelSelectionStore())
        return ChatViewModel(repository, graph.sessionRepository, AppClock { now }, ChatPolling(), models, speech, microphone)
            .also { created += it }
    }

    private suspend fun ChatViewModel.until(predicate: (ChatUiState) -> Boolean): ChatUiState =
        withContext(Dispatchers.Default) { withTimeout(10_000) { state.first(predicate) } }

    private fun bodyOf(request: RecordedRequest): JsonObject = Json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject

    private fun posts() = backend.requestsTo("POST", requestsPath).map(::bodyOf)

    /** Os envios são assíncronos: espera a rede registrar [count] pedidos. */
    private suspend fun awaitPosts(count: Int = 1): List<JsonObject> =
        withContext(Dispatchers.Default) {
            withTimeout(10_000) {
                while (backend.requestsTo("POST", requestsPath).size < count) kotlinx.coroutines.delay(10)
            }
            posts()
        }

    /** Deixa passar [ms] de relógio virtual, inclusive as tarefas marcadas para o instante final. */
    private fun kotlinx.coroutines.test.TestScope.pass(ms: Long) {
        advanceTimeBy(ms)
        runCurrent()
    }

    private fun JsonObject.string(name: String) = getValue(name).jsonPrimitive.content

    /** Fala "texto" e deixa passar o silêncio de 1,8 s: a mensagem sai e o pedido segue até o fim, então o chat volta a ouvir. */
    private suspend fun kotlinx.coroutines.test.TestScope.speakAndFinish(
        chat: ChatViewModel,
        text: String,
        startsAfter: Int,
    ) {
        speech.hear(text to true)
        pass(1_800)
        chat.until { it.pending == null && it.messages.size == 2 }
        chat.until { it.voice.listening }
        assertEquals(startsAfter, speech.starts)
    }

    // region Abrir o chat

    @Test
    fun `opening the chat starts listening and the agent bot shows it`() =
        runTest {
            val chat = newViewModel()

            chat.open()

            val state = chat.state.value
            assertEquals(1, speech.starts)
            assertTrue(state.voice.listening)
            assertEquals(BotState.Listening, state.bot)
            assertNull(state.voice.notice)
        }

    @Test
    fun `without speech recognition on the device the chat opens by text only`() =
        runTest {
            speech.available = false
            val chat = newViewModel()

            chat.open()

            assertEquals(0, speech.starts)
            assertFalse(chat.state.value.voice.available)
            assertEquals(BotState.Idle, chat.state.value.bot)
        }

    @Test
    fun `a session that arrives after the chat opened starts the microphone once`() =
        runTest {
            graph.storage.session = null
            val chat = chatOf()
            chat.open()
            assertEquals(0, speech.starts)

            graph.storage.session = StoredSession("access", "refresh", "user-1", "ana@example.com", "Ana")
            graph.sessionRepository.restore()
            chat.until { it.ready && it.voice.listening }

            assertEquals(1, speech.starts)
        }

    @Test
    fun `typing the first key turns the microphone off without delivering and keeps it off for this opening`() =
        runTest {
            val chat = newViewModel()
            chat.open()
            speech.hear("criar tarefa" to false)

            chat.typed("o")
            pass(5_000)

            assertEquals(1, speech.cancels)
            assertFalse(chat.state.value.voice.listening)
            assertEquals(BotState.Idle, chat.state.value.bot)
            assertTrue(posts().isEmpty())
            assertEquals(1, speech.starts)
        }

    @Test
    fun `closing the chat turns the microphone off`() =
        runTest {
            val chat = newViewModel()
            chat.open()

            chat.close()

            assertEquals(1, speech.cancels)
            assertFalse(chat.state.value.voice.listening)
        }

    // endregion

    // region Silêncio e envio

    @Test
    fun `1800 ms of silence after speaking sends the message and the request is followed`() =
        runTest {
            val chat = newViewModel()
            chat.open()

            speech.hear("Criar a reunião de sexta" to true)
            pass(1_799)
            assertTrue(posts().isEmpty())
            assertEquals(0, speech.stops)
            pass(1)
            chat.until { it.pending != null || it.messages.isNotEmpty() }

            assertEquals(1, speech.stops)
            assertEquals("Criar a reunião de sexta", awaitPosts().single().string("text"))
            assertEquals(
                "Criar a reunião de sexta",
                (
                    chat.state.value.messages
                        .first() as ChatMessage.User
                ).text,
            )
        }

    @Test
    fun `every new result restarts the silence count`() =
        runTest {
            val chat = newViewModel()
            chat.open()

            speech.hear("criar" to true)
            pass(1_500)
            speech.hear("criar" to true, "uma tarefa" to true)
            pass(1_500)
            assertEquals(0, speech.stops)
            pass(300)
            chat.until { it.messages.isNotEmpty() }

            assertEquals("criar uma tarefa", awaitPosts().single().string("text"))
        }

    @Test
    fun `silence without anything heard does not send`() =
        runTest {
            val chat = newViewModel()
            chat.open()

            pass(10_000)

            assertEquals(0, speech.stops)
            assertTrue(posts().isEmpty())
        }

    @Test
    fun `cumulative results that repeat finished phrases are not appended twice`() =
        runTest {
            val chat = newViewModel()
            chat.open()

            speech.hear("criar" to true)
            speech.hear("criar" to true, "uma tarefa" to true)
            speech.hear("criar" to true, "uma tarefa" to true, "para sexta" to false)

            assertEquals("criar uma tarefa para sexta", chat.state.value.voice.heard)
            pass(1_800)
            chat.until { it.messages.isNotEmpty() }
            // O que ainda estava saindo (não fechado) não vai: só as frases fechadas, como no web.
            assertEquals("criar uma tarefa", awaitPosts().single().string("text"))
        }

    @Test
    fun `what was heard is added to what was already typed`() =
        runTest {
            val chat = newViewModel()
            chat.syncDraft("Olá")
            chat.open()

            speech.hear("preciso de ajuda" to true)
            pass(1_800)
            chat.until { it.messages.isNotEmpty() }

            assertEquals("Olá preciso de ajuda", awaitPosts().single().string("text"))
        }

    @Test
    fun `sending by voice clears the field`() =
        runTest {
            val chat = newViewModel()
            val edits = mutableListOf<String>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { chat.promptEdits.collect { edits += it } }
            chat.syncDraft("Olá")
            chat.open()

            speech.hear("tudo bem" to true)
            pass(1_800)

            assertEquals(listOf(""), edits)
        }

    @Test
    fun `a spoken text that is a slash command falls into the field instead of being sent`() =
        runTest {
            val chat = newViewModel()
            val edits = mutableListOf<String>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { chat.promptEdits.collect { edits += it } }
            chat.syncDraft("/nota")
            chat.open()

            speech.hear("ideias" to true)
            pass(1_800)

            assertTrue(posts().isEmpty())
            assertEquals(listOf("/nota ideias"), edits)
            pass(5_000)
            assertEquals(1, speech.starts)
        }

    // endregion

    // region Laço de escuta

    @Test
    fun `after the answer the chat listens again`() =
        runTest {
            val chat = newViewModel()
            chat.open()

            speakAndFinish(chat, "Criar a reunião de sexta", startsAfter = 2)

            assertEquals(BotState.Listening, chat.state.value.bot)
        }

    @Test
    fun `saying para or chega ends the loop and sends nothing`() =
        runTest {
            val chat = newViewModel()
            chat.open()
            speakAndFinish(chat, "Criar a reunião de sexta", startsAfter = 2)

            speech.hear("Pode parar!" to true)
            pass(1_800)
            pass(10_000)

            assertEquals(1, posts().size)
            assertEquals(2, speech.starts)
            assertFalse(chat.state.value.voice.listening)
            assertEquals(BotState.Idle, chat.state.value.bot)
        }

    @Test
    fun `a no-speech error keeps the loop and any other error ends it`() =
        runTest {
            val chat = newViewModel()
            chat.open()
            speakAndFinish(chat, "Criar a reunião de sexta", startsAfter = 2)

            speech.fail(SpeechError.NoSpeech)
            speech.end()
            assertEquals(3, speech.starts)

            speech.fail(SpeechError.Network)
            speech.end()
            pass(5_000)
            assertEquals(3, speech.starts)
            assertFalse(chat.state.value.voice.listening)
        }

    @Test
    fun `sending by keyboard ends the loop and the microphone`() =
        runTest {
            val chat = newViewModel()
            chat.open()
            speakAndFinish(chat, "primeira", startsAfter = 2)

            assertTrue(chat.submit("segunda, digitada"))
            chat.until { it.pending == null && it.messages.size == 4 }

            assertEquals(1, speech.cancels)
            assertEquals(2, speech.starts)
            assertFalse(chat.state.value.voice.listening)
        }

    @Test
    fun `closing the chat ends the loop even with the request still running`() =
        runTest {
            val chat = newViewModel()
            chat.open()
            speech.hear("Criar a reunião de sexta" to true)
            pass(1_800)
            chat.until { it.pending != null }

            chat.close()
            chat.until { it.pending == null }
            pass(5_000)

            assertEquals(1, speech.starts)
        }

    // endregion

    // region Tocar no microfone

    @Test
    fun `tapping the microphone stops it and the transcript goes to the field, not to the AI`() =
        runTest {
            val chat = newViewModel()
            val edits = mutableListOf<String>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { chat.promptEdits.collect { edits += it } }
            chat.syncDraft("Olá")
            chat.open()
            speech.hear("tudo bem" to true)

            chat.toggleVoice()

            assertEquals(listOf("Olá tudo bem"), edits)
            assertTrue(posts().isEmpty())
            assertFalse(chat.state.value.voice.listening)
        }

    @Test
    fun `tapping the microphone when it is off starts a session whose errors are shown`() =
        runTest {
            val chat = newViewModel()
            chat.open()
            chat.typed("x")
            assertFalse(chat.state.value.voice.listening)

            chat.toggleVoice()
            assertTrue(chat.state.value.voice.listening)
            speech.fail(SpeechError.NoSpeech)
            speech.end()

            assertEquals("Não ouvi nada. Tente de novo.", chat.state.value.voice.notice)
            chat.toggleVoice()
            assertNull(chat.state.value.voice.notice)
        }

    @Test
    fun `an error from a microphone that opened by itself stays quiet`() =
        runTest {
            val chat = newViewModel()
            chat.open()

            speech.fail(SpeechError.NoSpeech)
            speech.end()

            assertNull(chat.state.value.voice.notice)
        }

    @Test
    fun `the microphone button does nothing while a request is pending`() =
        runTest {
            val chat = newViewModel()
            chat.send("oi")
            chat.until { it.pending != null }

            chat.toggleVoice()

            assertEquals(0, speech.starts)
        }

    @Test
    fun `a recognizer that cannot start shows the generic error`() =
        runTest {
            val chat = newViewModel()
            speech.failToStart = true

            chat.toggleVoice()

            assertEquals("Não foi possível gravar o áudio.", chat.state.value.voice.notice)
            assertFalse(chat.state.value.voice.listening)
        }

    // endregion

    // region Permissão

    @Test
    fun `the first time the chat asks for the microphone permission and starts when it is granted`() =
        runTest {
            microphone.granted = false
            val chat = newViewModel()

            chat.open()
            assertTrue(chat.state.value.voice.askPermission)
            assertEquals(0, speech.starts)

            microphone.granted = true
            chat.microphoneResult(true)

            assertFalse(chat.state.value.voice.askPermission)
            assertTrue(chat.state.value.voice.listening)
        }

    @Test
    fun `denied when the chat opened by itself is quiet, asks no more on the next opening and text still works`() =
        runTest {
            microphone.granted = false
            val chat = newViewModel()
            chat.open()

            chat.microphoneResult(false)

            assertFalse(chat.state.value.voice.askPermission)
            assertNull(chat.state.value.voice.notice)
            assertFalse(chat.state.value.voice.listening)
            chat.close()
            chat.open()
            assertFalse(chat.state.value.voice.askPermission)
            assertTrue(chat.send("segue por texto"))
            chat.until { it.messages.isNotEmpty() }
            assertEquals("segue por texto", awaitPosts().single().string("text"))
        }

    @Test
    fun `denied after the person tapped the microphone explains it`() =
        runTest {
            microphone.granted = false
            val chat = newViewModel()
            chat.open()
            chat.microphoneResult(false)

            chat.toggleVoice()
            assertTrue(chat.state.value.voice.askPermission)
            chat.microphoneResult(false)

            assertEquals("Permita o acesso ao microfone para gravar.", chat.state.value.voice.notice)
            assertFalse(chat.state.value.voice.listening)
        }

    @Test
    fun `a permission error from the recognizer shows the same explanation when the person tapped`() =
        runTest {
            val chat = newViewModel()
            chat.open()
            chat.typed("x")
            chat.toggleVoice()

            speech.fail(SpeechError.NotAllowed)
            speech.end()

            assertEquals("Permita o acesso ao microfone para gravar.", chat.state.value.voice.notice)
        }

    // endregion
}
