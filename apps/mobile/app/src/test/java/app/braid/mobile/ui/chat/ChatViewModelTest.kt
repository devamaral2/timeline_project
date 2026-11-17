package app.braid.mobile.ui.chat

import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.chat.DefaultChatRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.chat.ChatPolling
import app.braid.mobile.domain.chat.start
import app.braid.mobile.domain.request.RequestRoute
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** O chat com o agente pela fronteira de rede: o ViewModel real, com Retrofit e OkHttp reais, contra o servidor de teste. */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {
    private val first = "R00000000000000000000000A1"
    private val requestsPath = "/api/requests"
    private val firstPath = "$requestsPath/$first"
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
        // Uma consulta ainda em voo termina com o Main trocado, e não depois dele.
        Thread.sleep(150)
        created.forEach { it.viewModelScope.cancel() }
        backend.close()
        Dispatchers.resetMain()
    }

    private suspend fun newViewModel(polling: ChatPolling = ChatPolling()): ChatViewModel {
        graph.sessionRepository.restore()
        return ChatViewModel(
            DefaultChatRepository(graph.apis.create(RequestsApi::class.java)),
            graph.sessionRepository,
            AppClock { now },
            polling,
        ).also {
            created += it
            it.state.first { state -> state.ready }
        }
    }

    private suspend fun ChatViewModel.until(predicate: (ChatUiState) -> Boolean): ChatUiState =
        withContext(Dispatchers.Default) { withTimeout(10_000) { state.first(predicate) } }

    private fun ChatUiState.last(): ChatMessage = messages.last()

    private fun serveAccepted() = backend.route("POST", requestsPath, fixture("chat-accepted", 202))

    private fun bodyOf(request: RecordedRequest): JsonObject = Json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject

    private fun JsonObject.string(name: String) = getValue(name).jsonPrimitive.content

    private fun serveSteps() {
        serveAccepted()
        backend.route("GET", firstPath, fixture("chat-request-queued"), fixture("chat-request-running"), fixture("chat-request-done"))
    }

    @Test
    fun `sending posts the request with the screen and a stable id, then follows it to the end`() =
        runTest {
            serveSteps()
            val chat = newViewModel()

            assertTrue(chat.send("  Criar a reunião de sexta  "))
            val done =
                chat.until {
                    it.pending == null &&
                        it.messages.any { m -> m is ChatMessage.Process && m.request?.status == TaskStatus.Done }
                }

            val body = bodyOf(backend.requestsTo("POST", requestsPath).single())
            assertEquals("user-1", body.string("userId"))
            assertEquals("Criar a reunião de sexta", body.string("text"))
            assertEquals("agenda", body.getValue("context").jsonObject.string("screen"))
            assertFalse(body.containsKey("sessionId"))
            assertTrue(body.string("clientMessageId").isNotEmpty())
            assertEquals(ChatMessage.User(body.string("clientMessageId"), "Criar a reunião de sexta"), done.messages.first())
            val box = done.messages[1] as ChatMessage.Process
            assertEquals("Criei a tarefa para sexta às 10h.", box.request?.message)
            assertEquals(
                listOf("Tarefa criada", "Nota alterada", "Tarefa apagada"),
                box.request!!.entities.map {
                    app.braid.mobile.domain.chat
                        .chatEntityText(it)
                },
            )
            assertEquals(2, done.messages.size)
            assertEquals(RequestRoute.Steps, done.turns.single().route)
            assertFalse(done.turns.single().running)
        }

    @Test
    fun `the process box shows the steps while the request runs and the polling is every second`() =
        runTest {
            assertEquals(1_000L, ChatPolling().intervalMs)
            assertEquals(180_000L, ChatPolling().timeoutMs)
            serveAccepted()
            backend.route("GET", firstPath, fixture("chat-request-running"))
            val chat = newViewModel()

            chat.send("Criar a reunião de sexta")
            val running = chat.until { (it.messages.getOrNull(1) as? ChatMessage.Process)?.request != null }

            val box = running.messages[1] as ChatMessage.Process
            assertEquals(listOf("Entendendo o pedido", "Criando a tarefa", "Escrevendo a resposta"), box.request!!.steps.map { it.label })
            assertEquals("Realizando processos", running.pending?.label)
            assertEquals(first, running.pending?.requestId)
            assertEquals(BotState.Thinking, running.bot)
            // Uma segunda mensagem espera o pedido terminar.
            assertFalse(chat.send("outra"))
        }

    @Test
    fun `the second message continues the session of the first request`() =
        runTest {
            serveSteps()
            val chat = newViewModel()
            chat.send("primeira")
            chat.until { it.pending == null && it.messages.size == 2 }

            chat.send("segunda")
            chat.until { it.pending == null && it.messages.size == 4 }

            val bodies = backend.requestsTo("POST", requestsPath).map(::bodyOf)
            assertEquals(first, bodies[1].string("sessionId"))
            assertNotEquals(bodies[0].string("clientMessageId"), bodies[1].string("clientMessageId"))
        }

    @Test
    fun `a query step shows its table and the final answer`() =
        runTest {
            serveAccepted()
            backend.route("GET", firstPath, fixture("chat-request-query"))
            val chat = newViewModel()

            chat.send("O que tenho amanhã?")
            val box = chat.until { it.pending == null && it.messages.size == 2 }.messages[1] as ChatMessage.Process

            val table =
                box.request!!
                    .steps
                    .single()
                    .result!!
            assertEquals(listOf("Tarefa", "Início"), table.columns)
            assertEquals(listOf(listOf("Dentista", "09:00"), listOf("Almoço", "")), table.rows)
            assertTrue(table.truncated)
            assertEquals("Você tem duas tarefas amanhã.", box.request.message)
        }

    @Test
    fun `cancelling posts the cancel and ends the request as cancelled without failing the message`() =
        runTest {
            serveAccepted()
            backend.route("GET", firstPath, fixture("chat-request-running"))
            backend.route("POST", "$firstPath/cancel", fixture("chat-request-cancelled"))
            val chat = newViewModel()
            chat.send("Criar a reunião de sexta")
            chat.until { it.pending?.requestId == first }

            chat.cancel()
            val ended = chat.until { it.pending == null }

            assertEquals(1, backend.requestsTo("POST", "$firstPath/cancel").size)
            val error = ended.last() as ChatMessage.Error
            assertEquals("Pedido cancelado.", error.text)
            assertFalse((ended.messages.first() as ChatMessage.User).failed)
            assertFalse(ended.turns.single().running)
        }

    @Test
    fun `a failed request says why, keeps the text for retry and a retry opens a new request`() =
        runTest {
            serveAccepted()
            backend.route("GET", firstPath, fixture("chat-request-failed"))
            val chat = newViewModel()
            chat.send("Criar a reunião de sexta")

            val failed = chat.until { it.last() is ChatMessage.Error }
            val error = failed.last() as ChatMessage.Error
            assertEquals("Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo.", error.text)
            assertEquals("Criar a reunião de sexta", error.retryText)
            assertTrue((failed.messages.first() as ChatMessage.User).failed)
            assertFalse(error.reuseMessageId)
            assertEquals(BotState.Error, failed.bot)

            backend.route("GET", firstPath, fixture("chat-request-done"))
            chat.retry(error.id)
            chat.until { it.pending == null && it.last() is ChatMessage.Process }

            val bodies = backend.requestsTo("POST", requestsPath).map(::bodyOf)
            assertEquals(2, bodies.size)
            assertNotEquals(bodies[0].string("clientMessageId"), bodies[1].string("clientMessageId"))
            assertEquals("Criar a reunião de sexta", bodies[1].string("text"))
            // O pedido que falhou e o erro dele saíram da conversa.
            assertEquals(2, chat.state.value.messages.size)
        }

    @Test
    fun `a request the server rejects maps its status to the text the web shows`() =
        runTest {
            val cases =
                mapOf(
                    400 to "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
                    403 to "Você não tem permissão para acessar esses dados.",
                    409 to "Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo.",
                    503 to "A IA está indisponível agora. Tente de novo em instantes.",
                    500 to "Não consegui conectar ao assistente. Tente de novo.",
                )
            for ((code, text) in cases) {
                backend.route("POST", requestsPath, status(code))
                val chat = newViewModel()
                chat.send("oi $code")
                val error = chat.until { it.last() is ChatMessage.Error }.last() as ChatMessage.Error
                assertEquals("$code", text, error.text)
                assertEquals("$code", code == 500, error.reuseMessageId)
            }
        }

    @Test
    fun `a network failure retries with the same message id so the server returns the same request`() =
        runTest {
            backend.route("POST", requestsPath, status(500))
            val chat = newViewModel()
            chat.send("Criar a reunião de sexta")
            val error = chat.until { it.last() is ChatMessage.Error }.last() as ChatMessage.Error
            assertTrue(error.reuseMessageId)

            serveSteps()
            chat.retry(error.id)
            chat.until { it.pending == null && it.last() is ChatMessage.Process }

            val ids = backend.requestsTo("POST", requestsPath).map { bodyOf(it).string("clientMessageId") }
            assertEquals(2, ids.size)
            assertEquals(ids[0], ids[1])
        }

    @Test
    fun `an expired session while following ends the request as session expired`() =
        runTest {
            serveAccepted()
            backend.route("GET", firstPath, status(401))
            // O Auth fora do ar mantém a sessão: o 401 chega ao chat em vez de levar ao login.
            backend.route("POST", "/auth/token/refresh", status(503))
            val chat = newViewModel()
            chat.send("oi")

            val error = chat.until { it.last() is ChatMessage.Error }.last() as ChatMessage.Error

            assertEquals("Sua sessão acabou. Entre de novo para continuar.", error.text)
            assertTrue(error.reuseMessageId)
        }

    @Test
    fun `five failed polls in a row lose the connection, and the agenda is told to read again`() =
        runTest {
            serveAccepted()
            backend.route("GET", firstPath, status(500))
            val chat = newViewModel()
            chat.entitiesChanged.test {
                chat.send("oi")
                val error = chat.until { it.last() is ChatMessage.Error }.last() as ChatMessage.Error

                assertEquals("A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar.", error.text)
                assertEquals(5, backend.requestsTo("GET", firstPath).size)
                assertTrue(error.reuseMessageId)
                awaitItem()
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun `a request that never finishes is given up on after the limit`() =
        runTest {
            serveAccepted()
            backend.route("GET", firstPath, fixture("chat-request-running"))
            val chat = newViewModel(ChatPolling(intervalMs = 1_000, timeoutMs = 3_000))
            chat.send("oi")

            val error = chat.until { it.last() is ChatMessage.Error }.last() as ChatMessage.Error

            assertEquals("A conexão caiu antes da resposta. Se o pedido gravava algo, confira a agenda antes de reenviar.", error.text)
            val polls = backend.requestsTo("GET", firstPath).size
            assertTrue("$polls polls", polls in 4..6)
        }

    @Test
    fun `a request that changed records tells the agenda, and a plain query does not`() =
        runTest {
            serveSteps()
            val chat = newViewModel()
            chat.entitiesChanged.test {
                chat.send("criar")
                chat.until { it.pending == null && it.messages.size == 2 }
                awaitItem()

                backend.route("POST", requestsPath, fixture("chat-accepted", 202))
                backend.route("GET", firstPath, fixture("chat-request-query"))
                chat.send("consultar")
                chat.until { it.pending == null && it.messages.size == 4 }
                expectNoEvents()
            }
        }

    @Test
    fun `the Hermes command alone turns the mode on without calling the server, and the app command turns it off`() =
        runTest {
            val chat = newViewModel()

            chat.send("/hermes")
            val on = chat.until { it.hermesMode }
            assertEquals(
                "Agora você está falando com o Hermes. Escreva /app para voltar ao assistente da agenda.",
                (on.last() as ChatMessage.Assistant).text,
            )
            assertEquals(0, backend.requests.size)

            chat.send("/app")
            val off = chat.until { !it.hermesMode }
            assertEquals("De volta ao assistente da agenda.", (off.last() as ChatMessage.Assistant).text)
            assertEquals(0, backend.requests.size)
        }

    @Test
    fun `in Hermes mode the messages go to the Hermes route and its steps and answer show in the conversation`() =
        runTest {
            backend.route("POST", "$requestsPath/hermes", fixture("chat-hermes-accepted", 202))
            backend.route("GET", firstPath, fixture("chat-hermes-accepted"), fixture("chat-hermes-done"))
            val chat = newViewModel()
            chat.send("/hermes oi tudo bem")

            val done = chat.until { it.pending == null && it.messages.any { m -> m is ChatMessage.Assistant && m.id.endsWith("-answer") } }

            val body = bodyOf(backend.requestsTo("POST", "$requestsPath/hermes").single())
            assertEquals("oi tudo bem", body.string("text"))
            assertEquals("user-1", body.string("userId"))
            assertFalse(body.containsKey("sessionId"))
            assertTrue(done.hermesMode)
            assertEquals(0, backend.requestsTo("POST", requestsPath).size)
            // A caixa de processo não aparece: no lugar dela, os passos do Hermes.
            assertTrue(done.messages.none { it is ChatMessage.Process })
            val steps = done.messages.filterIsInstance<ChatMessage.HermesSteps>().single()
            assertEquals(listOf("Pensou", "Executou um comando"), steps.steps.map { it.label })
            assertFalse(steps.running)
            val answer = done.last() as ChatMessage.Assistant
            assertEquals("Quer o resumo completo? Diga \"só gmail\" ou \"com calendar e drive\".", answer.text)
            assertEquals(RequestRoute.Hermes, done.turns.single().route)

            // A mensagem seguinte continua no Hermes, na mesma sessão.
            chat.send("e agora?")
            chat.until { it.pending == null && it.messages.size > done.messages.size }
            val second = bodyOf(backend.requestsTo("POST", "$requestsPath/hermes")[1])
            assertEquals(first, second.string("sessionId"))
        }

    @Test
    fun `with the Hermes off the notice shows and the mode turns off`() =
        runTest {
            backend.route("POST", "$requestsPath/hermes", status(404))
            val chat = newViewModel()

            chat.send("/hermes oi")
            val off = chat.until { it.pending == null && it.messages.size == 2 }

            assertFalse(off.hermesMode)
            assertEquals("O Hermes está desligado neste ambiente (AI_AUTOMATION).", (off.last() as ChatMessage.Assistant).text)
            assertEquals(0, backend.requestsTo("GET", firstPath).size)
        }

    @Test
    fun `a Hermes request the server could not answer shows the server message`() =
        runTest {
            backend.route("POST", "$requestsPath/hermes", fixture("chat-hermes-failed", 202))
            backend.route("GET", firstPath, fixture("chat-hermes-failed"))
            val chat = newViewModel()

            chat.send("/hermes oi")
            val error = chat.until { it.last() is ChatMessage.Error }.last() as ChatMessage.Error

            assertEquals("O Hermes não respondeu a tempo.", error.text)
        }

    @Test
    fun `opening the chat finds the requests still open and follows each of them`() =
        runTest {
            backend.route("GET", requestsPath, fixture("chat-request-list"))
            backend.route("GET", "$requestsPath/R00000000000000000000000B9", fixture("chat-request-running"))
            backend.route("GET", "$requestsPath/R00000000000000000000000C3", fixture("chat-request-running"))
            backend.route("GET", "$requestsPath/R00000000000000000000000C2", fixture("chat-hermes-accepted"))
            val chat = newViewModel()

            chat.open()
            val restored = chat.until { it.messages.size >= 5 }

            // Do mais antigo para o mais novo; o pedido que terminou e o de voz não voltam. Sem texto, vale o título.
            val ids =
                listOf(
                    "R00000000000000000000000B9",
                    "R00000000000000000000000B9-process",
                    "R00000000000000000000000C2",
                    "R00000000000000000000000C3",
                    "R00000000000000000000000C3-process",
                )
            assertEquals(ids, restored.messages.map { it.id }.take(5))
            assertEquals("Sem texto", (restored.messages[0] as ChatMessage.User).text)
            assertEquals("Resumir meu e-mail", (restored.messages[2] as ChatMessage.User).text)
            assertEquals("Realizando processos", restored.pending?.label)
            assertEquals("R00000000000000000000000C3", restored.pending?.requestId)
            assertEquals(3, restored.turns.size)
            assertTrue(restored.turns.all { it.running })
        }

    @Test
    fun `closing and opening again does not repeat the requests the conversation already shows`() =
        runTest {
            serveSteps()
            val chat = newViewModel()
            chat.open()
            chat.send("primeira")
            chat.until { it.pending == null && it.messages.size == 2 }
            chat.close()
            assertFalse(chat.state.value.open)
            assertEquals(2, chat.state.value.messages.size)

            backend.route("GET", requestsPath, MockResponse().setResponseCode(200).setBody("[]"))
            chat.open()
            delay(50)

            assertTrue(chat.state.value.open)
            assertEquals(2, chat.state.value.messages.size)
        }

    @Test
    fun `a new conversation clears the screen and the session, but not while a request runs`() =
        runTest {
            serveAccepted()
            backend.route("GET", firstPath, fixture("chat-request-running"))
            val chat = newViewModel()
            chat.send("primeira")
            chat.until { it.pending?.requestId == first }

            chat.startNewConversation()
            assertEquals(2, chat.state.value.messages.size)

            backend.route("GET", firstPath, fixture("chat-request-done"))
            chat.until { it.pending == null }
            chat.send("/hermes")
            chat.startNewConversation()
            val empty = chat.state.value
            assertTrue(empty.messages.isEmpty())
            assertTrue(empty.turns.isEmpty())
            assertFalse(empty.hermesMode)

            chat.send("segunda")
            chat.until { it.pending == null && it.messages.size == 2 }
            assertFalse(bodyOf(backend.requestsTo("POST", requestsPath).last()).containsKey("sessionId"))
        }

    @Test
    fun `tapping a free window starts a new conversation with the window attached to the next request`() =
        runTest {
            serveSteps()
            val chat = newViewModel()
            chat.send("antiga")
            chat.until { it.pending == null && it.messages.size == 2 }

            chat.openWithFreeWindow(
                FreeWindow(
                    "2026-09-14",
                    Instant.parse("2026-09-14T13:30:00Z").toEpochMilli(),
                    Instant.parse("2026-09-14T16:00:00Z").toEpochMilli(),
                    150,
                    false,
                ),
            )
            val attached = chat.state.value
            assertTrue(attached.open)
            assertTrue(attached.messages.isEmpty())
            assertEquals("10:30", attached.freeWindow?.start)

            assertTrue(chat.submit("marcar um treino"))
            val sent = chat.until { it.pending == null && it.messages.size == 2 }

            assertNull(sent.freeWindow)
            val body = bodyOf(backend.requestsTo("POST", requestsPath).last())
            assertEquals("Sobre a janela livre de seg, 14 de set, das 10:30 às 13:00 (2 h 30 min): marcar um treino", body.string("text"))
            assertFalse(body.containsKey("sessionId"))
        }

    @Test
    fun `closing the chat drops an attached window that was not sent`() =
        runTest {
            val chat = newViewModel()
            chat.openWithFreeWindow(FreeWindow("2026-09-14", 0, 1, 15, false))
            chat.close()
            assertNull(chat.state.value.freeWindow)
        }

    @Test
    fun `the bot thinks while a request runs, shows the outcome for 2400 ms and goes back to rest`() =
        runTest {
            serveSteps()
            val chat = newViewModel()
            val seen = mutableListOf<Pair<BotState, Long>>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                chat.state
                    .map { it.bot }
                    .distinctUntilChanged()
                    .collect { seen += it to testScheduler.currentTime }
            }

            chat.send("oi")
            chat.until { it.bot == BotState.Idle && it.pending == null && it.messages.size == 2 }

            assertEquals(listOf(BotState.Idle, BotState.Thinking, BotState.Done, BotState.Idle), seen.map { it.first })
            assertEquals(2_400L, seen[3].second - seen[2].second)
        }

    @Test
    fun `a failed request leaves the bot on the error for 2600 ms`() =
        runTest {
            serveAccepted()
            backend.route("GET", firstPath, fixture("chat-request-failed"))
            val chat = newViewModel()
            val seen = mutableListOf<Pair<BotState, Long>>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
                chat.state
                    .map { it.bot }
                    .distinctUntilChanged()
                    .collect { seen += it to testScheduler.currentTime }
            }

            chat.send("oi")
            chat.until { it.bot == BotState.Idle && it.pending == null && it.messages.size == 3 }

            assertEquals(listOf(BotState.Idle, BotState.Thinking, BotState.Error, BotState.Idle), seen.map { it.first })
            assertEquals(2_600L, seen[3].second - seen[2].second)
        }

    @Test
    fun `nothing is sent without a signed in user, and an empty message is ignored`() =
        runTest {
            graph.storage.session = null
            val chat =
                ChatViewModel(
                    DefaultChatRepository(graph.apis.create(RequestsApi::class.java)),
                    graph.sessionRepository,
                    AppClock { now },
                    ChatPolling(),
                )
            graph.sessionRepository.restore()
            created += chat
            val state = chat.until { it.signedOut }

            assertFalse(state.ready)
            assertFalse(chat.send("oi"))
            assertEquals(0, backend.requests.size)
        }
}
