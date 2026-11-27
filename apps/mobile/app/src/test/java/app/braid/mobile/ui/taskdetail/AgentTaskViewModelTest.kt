package app.braid.mobile.ui.taskdetail

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.requests.DefaultAgentRequestRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.request.PreviousRequest
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.FakeMicrophone
import app.braid.mobile.support.FakeSpeechRecognizer
import app.braid.mobile.support.Fixtures
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant
import java.util.concurrent.CountDownLatch

/** O detalhe da tarefa de agente pela rede: leitura do pedido, continuar, cancelar e a releitura a cada 3 s. */
@OptIn(ExperimentalCoroutinesApi::class)
class AgentTaskViewModelTest {
    private val taskPath = "/api/tasks/task-agent"
    private val requestPath = "/api/requests/task-agent"
    private val now = Instant.parse("2026-09-14T15:00:00.000Z")

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val speech = FakeSpeechRecognizer()
    private val microphone = FakeMicrophone()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        graph.storage.session = StoredSession("access", "refresh", userId = "user-7", email = "a@b.c", name = "Ana")
    }

    private val created = mutableListOf<AgentTaskViewModel>()

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private fun serveAgent(request: String = "request-running") {
        backend.route("GET", taskPath, fixture("task-detail-agent"))
        backend.route("GET", requestPath, fixture(request))
        backend.route("GET", "/api/requests/req-first", fixture("request-first"))
    }

    private suspend fun newViewModel(): AgentTaskViewModel {
        graph.sessionRepository.restore()
        return AgentTaskViewModel(
            SavedStateHandle(mapOf("taskId" to "task-agent")),
            DefaultTaskDetailRepository(graph.apis.create(TaskDetailApi::class.java)),
            DefaultTaskRepository(graph.apis.create(TasksApi::class.java)),
            DefaultAgentRequestRepository(graph.apis.create(RequestsApi::class.java)),
            graph.sessionRepository,
            AppClock { now },
            speech,
            microphone,
        ).also(created::add)
    }

    private suspend fun AgentTaskViewModel.content(): AgentTaskUiState.Content =
        state.first {
            it is AgentTaskUiState.Content
        } as AgentTaskUiState.Content

    /** O conteúdo com a sessão e a hierarquia já lidas. */
    private suspend fun AgentTaskViewModel.settled(): AgentTaskUiState.Content =
        state.first {
            it is AgentTaskUiState.Content &&
                it.previous !is PreviousRequest.Loading &&
                (it.parent == null || it.parent.cards != null) &&
                (it.subtasks == null || it.subtasks.cards != null)
        } as AgentTaskUiState.Content

    private fun reads(path: String): Int = backend.requestsTo("GET", path).size

    /** Espera o servidor de teste receber [count] leituras de [path], em tempo real: a rede não anda no relógio virtual. */
    private suspend fun awaitReads(
        path: String,
        count: Int,
    ) = withContext(Dispatchers.Default) {
        withTimeout(5_000) { while (reads(path) < count) delay(5) }
    }

    private fun postBody(path: String): JsonObject =
        Json
            .parseToJsonElement(
                backend
                    .requestsTo("POST", path)
                    .single()
                    .body
                    .clone()
                    .readUtf8(),
            ).jsonObject

    @Test
    fun `it reads the task and the request with the same id and shows what the request holds`() =
        runTest {
            serveAgent()

            val content = newViewModel().settled()

            assertEquals(1, reads(requestPath))
            assertEquals("Buscar passagens", content.task.card.name)
            assertEquals(TaskStatus.Running, content.request.status)
            assertEquals(listOf("e1", "e2", "e3"), content.request.entries.map { it.id })
            assertEquals(listOf("s1", "s2", "s3"), content.request.steps.map { it.id })
            assertEquals(
                listOf(
                    RequestOperation.Create,
                    RequestOperation.Create,
                    RequestOperation.Update,
                    RequestOperation.Delete,
                    RequestOperation.Update,
                ),
                content.request.entities.map { it.operation },
            )
            assertEquals("Buscando voos…", content.statusLine)
            assertTrue(content.canCancel)
        }

    private val situationPath = "/api/tasks/task-agent/situation"

    /** Segura a resposta do `PUT` até o teste soltar, para conferir o que a tela mostra enquanto grava. */
    private fun holdSituationPut(response: MockResponse): CountDownLatch {
        val release = CountDownLatch(1)
        backend.route("PUT", situationPath) {
            release.await()
            response
        }
        return release
    }

    @Test
    fun `the situation of a finished request comes from the request, and an open one has none`() =
        runTest {
            serveAgent("request-done-to-review")
            assertEquals(TaskSituation.ToReview, newViewModel().settled().request.situation)

            serveAgent()
            assertNull(newViewModel().settled().request.situation)
        }

    @Test
    fun `choosing a situation changes it at once and saves it with the PUT`() =
        runTest {
            serveAgent("request-done-to-review")
            val release = holdSituationPut(fixture("task-situation-reviewed"))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.chooseSituation(TaskSituation.Reviewed)

            assertEquals(TaskSituation.Reviewed, viewModel.content().request.situation)
            release.countDown()
            viewModel.state.first { it is AgentTaskUiState.Content && !it.savingSituation }
            val body =
                Json
                    .parseToJsonElement(
                        backend
                            .requestsTo("PUT", situationPath)
                            .single()
                            .body
                            .clone()
                            .readUtf8(),
                    ).jsonObject
            assertEquals("reviewed", body.getValue("situation").jsonPrimitive.content)
            assertEquals(TaskSituation.Reviewed, viewModel.content().request.situation)
            assertNull(viewModel.content().situationError)
        }

    @Test
    fun `with the API failing the situation goes back and the screen says so`() =
        runTest {
            serveAgent("request-done-to-review")
            val release = holdSituationPut(status(500))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.chooseSituation(TaskSituation.Bookmarked)
            assertEquals(TaskSituation.Bookmarked, viewModel.content().request.situation)
            release.countDown()
            val after = viewModel.state.first { it is AgentTaskUiState.Content && it.situationError != null } as AgentTaskUiState.Content

            assertEquals(TaskSituation.ToReview, after.request.situation)
            assertEquals(SITUATION_FAILED_TEXT, after.situationError)
        }

    @Test
    fun `a request with no situation, or the one it already has, saves nothing`() =
        runTest {
            serveAgent()
            val open = newViewModel()
            open.settled()
            open.chooseSituation(TaskSituation.Reviewed)

            serveAgent("request-done-to-review")
            val done = newViewModel()
            done.settled()
            done.chooseSituation(TaskSituation.ToReview)

            assertEquals(0, backend.requests.count { it.method == "PUT" })
        }

    @Test
    fun `the status comes from the request, not from the task`() =
        runTest {
            serveAgent("request-waiting")

            val content = newViewModel().settled()

            assertEquals(TaskStatus.Running, content.task.status)
            assertEquals(TaskStatus.Waiting, content.request.status)
        }

    @Test
    fun `a missing or foreign request says so, and any other failure offers a retry`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-agent"))
            backend.route("GET", requestPath, status(404))
            assertEquals(AgentTaskUiState.Missing("Pedido não encontrado."), newViewModel().state.first { it !is AgentTaskUiState.Loading })

            backend.route("GET", requestPath, status(403))
            assertEquals(AgentTaskUiState.Missing("Pedido não encontrado."), newViewModel().state.first { it !is AgentTaskUiState.Loading })

            backend.route("GET", requestPath, status(500), fixture("request-running"))
            val viewModel = newViewModel()
            assertEquals(
                AgentTaskUiState.Failed("Não foi possível carregar o pedido. Tente novamente."),
                viewModel.state.first {
                    it !is AgentTaskUiState.Loading
                },
            )

            viewModel.retry()
            assertEquals(
                "Buscar passagens",
                viewModel
                    .content()
                    .task.card.name,
            )
        }

    @Test
    fun `a missing task says the task was not found`() =
        runTest {
            backend.route("GET", taskPath, status(404))
            backend.route("GET", requestPath, fixture("request-running"))

            assertEquals(AgentTaskUiState.Missing("Tarefa não encontrada."), newViewModel().state.first { it !is AgentTaskUiState.Loading })
        }

    @Test
    fun `the hierarchy reads each linked task and hides itself when there is none`() =
        runTest {
            serveAgent()
            backend.route("GET", taskPath, fixture("task-detail-agent-linked"))
            backend.route("GET", "/api/tasks/task-parent", fixture("task-detail-parent"))
            backend.route("GET", "/api/tasks/task-sub-1", fixture("task-detail-sub-1"))

            val linked = newViewModel().settled()
            assertEquals(listOf("task-parent"), linked.parent!!.cards!!.map { it.id })
            assertEquals(listOf("task-sub-1"), linked.subtasks!!.cards!!.map { it.id })

            serveAgent()
            val plain = newViewModel().settled()
            assertNull(plain.parent)
            assertNull(plain.subtasks)
        }

    @Test
    fun `the session shows the first request of the session, and says when it is gone`() =
        runTest {
            serveAgent()
            val found =
                newViewModel().state.first {
                    it is AgentTaskUiState.Content && it.previous is PreviousRequest.Found
                } as AgentTaskUiState.Content
            val previous = found.previous as PreviousRequest.Found
            assertEquals("req-first", previous.id)
            assertEquals("Planejar a viagem", previous.title)
            assertEquals(Instant.parse("2026-09-13T12:00:00.000Z"), previous.createdAt)

            backend.route("GET", "/api/requests/req-first", status(404))
            val gone = newViewModel().state.first { it is AgentTaskUiState.Content && it.previous is PreviousRequest.NotFound }
            assertTrue(gone is AgentTaskUiState.Content)

            serveAgent("request-queued")
            val none = newViewModel().content()
            assertEquals(PreviousRequest.None, none.previous)
        }

    @Test
    fun `continuing sends a new request in the same session and follows it`() =
        runTest {
            serveAgent()
            backend.route("POST", "/api/requests", fixture("request-accepted").setResponseCode(202))
            backend.route("GET", "/api/requests/req-new", fixture("request-follow-running"))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.onDraftChange("  Só voos diretos  ")
            viewModel.send()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content &&
                        it.composer.followId == "req-new" &&
                        it.composer.followed != null
                } as AgentTaskUiState.Content

            val body = postBody("/api/requests")
            assertEquals("user-7", body.getValue("userId").jsonPrimitive.content)
            assertEquals("Só voos diretos", body.getValue("text").jsonPrimitive.content)
            assertEquals("req-first", body.getValue("sessionId").jsonPrimitive.content)
            assertTrue(
                body
                    .getValue("clientMessageId")
                    .jsonPrimitive.content
                    .matches(Regex("[A-Za-z0-9_-]{1,128}")),
            )
            assertEquals("", content.composer.draft)
            assertFalse(content.composer.sending)
            assertEquals("Filtrando os voos…", content.statusLine)
            assertEquals("Só voos diretos", content.tracked!!.title)
            // A página continua mostrando o pedido original.
            assertEquals("task-agent", content.request.id)
            assertEquals(1, reads("/api/requests/req-new"))
        }

    @Test
    fun `a request without a session starts one from its own id`() =
        runTest {
            serveAgent("request-queued")
            backend.route("POST", "/api/requests", fixture("request-accepted").setResponseCode(202))
            backend.route("GET", "/api/requests/req-new", fixture("request-follow-running"))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.onDraftChange("Mais um")
            viewModel.send()
            viewModel.state.first { it is AgentTaskUiState.Content && it.composer.followed != null }

            assertEquals("task-agent", postBody("/api/requests").getValue("sessionId").jsonPrimitive.content)
        }

    @Test
    fun `a blank draft sends nothing, and the draft stops at 4000 characters`() =
        runTest {
            serveAgent()
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.onDraftChange("   ")
            viewModel.send()
            assertTrue(backend.requestsTo("POST", "/api/requests").isEmpty())

            viewModel.onDraftChange("a".repeat(4_100))
            assertEquals(4_000, (viewModel.state.value as AgentTaskUiState.Content).composer.draft.length)
        }

    @Test
    fun `a failed send keeps the draft and says the assistant could not be reached`() =
        runTest {
            serveAgent()
            backend.route("POST", "/api/requests", status(500))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.onDraftChange("Só voos diretos")
            viewModel.send()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content && it.composer.error != null && !it.composer.sending
                } as AgentTaskUiState.Content

            assertEquals("Não consegui conectar ao assistente. Tente de novo.", content.composer.error)
            assertEquals("Só voos diretos", content.composer.draft)
            assertNull(content.composer.followId)
        }

    @Test
    fun `a followed request that fails shows why`() =
        runTest {
            serveAgent()
            backend.route("POST", "/api/requests", fixture("request-accepted").setResponseCode(202))
            backend.route("GET", "/api/requests/req-new", fixture("request-follow-failed"))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.onDraftChange("Só voos diretos")
            viewModel.send()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content && it.composer.followed != null
                } as AgentTaskUiState.Content

            assertEquals("Não deu certo", content.statusLine)
            assertEquals("A IA está indisponível agora. Tente de novo em instantes.", content.followFailure)
            assertFalse(content.canCancel)
        }

    @Test
    fun `cancelling posts to the open request and shows it cancelled`() =
        runTest {
            serveAgent()
            backend.route("POST", "$requestPath/cancel", fixture("request-cancelled"))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.cancel()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content && it.request.status == TaskStatus.Cancelled
                } as AgentTaskUiState.Content

            assertEquals(1, backend.requestsTo("POST", "$requestPath/cancel").size)
            assertEquals("Pedido cancelado", content.statusLine)
            assertFalse(content.canCancel)
            assertNull(content.composer.error)
        }

    @Test
    fun `cancelling after continuing cancels the followed request`() =
        runTest {
            serveAgent()
            backend.route("POST", "/api/requests", fixture("request-accepted").setResponseCode(202))
            backend.route("GET", "/api/requests/req-new", fixture("request-follow-running"))
            backend.route("POST", "/api/requests/req-new/cancel", fixture("request-follow-done"))
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.onDraftChange("Só voos diretos")
            viewModel.send()
            viewModel.state.first { it is AgentTaskUiState.Content && it.composer.followed != null }

            viewModel.cancel()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content && it.composer.followed?.status == TaskStatus.Completed
                } as AgentTaskUiState.Content

            assertEquals(1, backend.requestsTo("POST", "/api/requests/req-new/cancel").size)
            assertTrue(backend.requestsTo("POST", "$requestPath/cancel").isEmpty())
            assertEquals(TaskStatus.Running, content.request.status)
            assertEquals("Pronto", content.statusLine)
        }

    @Test
    fun `a food request answers 409 and the message says to delete the food`() =
        runTest {
            serveAgent()
            backend.route("POST", "$requestPath/cancel", status(409))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.cancel()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content && it.composer.error != null && !it.composer.cancelling
                } as AgentTaskUiState.Content

            assertEquals("Este pedido calcula um alimento: apague o alimento para parar o cálculo.", content.composer.error)
            assertEquals(TaskStatus.Running, content.request.status)
        }

    @Test
    fun `any other cancel failure says the assistant could not be reached`() =
        runTest {
            serveAgent()
            backend.route("POST", "$requestPath/cancel", status(500))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.cancel()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content && it.composer.error != null && !it.composer.cancelling
                } as AgentTaskUiState.Content

            assertEquals("Não consegui conectar ao assistente. Tente de novo.", content.composer.error)
        }

    @Test
    fun `the footer line follows the request`() =
        runTest {
            val lines =
                mapOf(
                    "request-queued" to "Entendendo o pedido…",
                    "request-bare" to "Entendendo o pedido…",
                    "request-no-progress" to "Buscar voos",
                    "request-running" to "Buscando voos…",
                    "request-done" to "Pronto",
                    "request-failed" to "Não deu certo",
                    "request-cancelled" to "Pedido cancelado",
                    // Aguardando o usuário também é pedido aberto: a linha segue o passo em execução.
                    "request-waiting" to "Buscar voos",
                )
            for ((fixtureName, line) in lines) {
                serveAgent(fixtureName)
                assertEquals(fixtureName, line, newViewModel().content().statusLine)
            }
        }

    @Test
    fun `an open request re-reads the request and the task every 3 seconds, only while visible`() =
        runTest {
            serveAgent()
            val viewModel = newViewModel()
            viewModel.settled()
            val before = reads(requestPath)

            advanceTimeBy(60_000)
            runCurrent()
            assertEquals("not visible, no polling", before, reads(requestPath))

            viewModel.setVisible(true)
            advanceTimeBy(2_999)
            runCurrent()
            assertEquals(before, reads(requestPath))
            val tasksBefore = reads(taskPath)
            advanceTimeBy(1)
            runCurrent()
            awaitReads(requestPath, before + 1)
            awaitReads(taskPath, tasksBefore + 1)

            viewModel.setVisible(false)
            val whenLeft = reads(requestPath)
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(whenLeft, reads(requestPath))
        }

    @Test
    fun `it stops when the request finishes, after one last re-read of the task`() =
        runTest {
            var finished = false
            backend.route("GET", requestPath) { if (finished) fixture("request-done") else fixture("request-running") }
            backend.route("GET", taskPath) { if (finished) fixture("task-detail-agent-done") else fixture("task-detail-agent") }
            backend.route("GET", "/api/requests/req-first", fixture("request-first"))
            val viewModel = newViewModel()
            viewModel.setVisible(true)
            viewModel.settled()
            finished = true

            advanceTimeBy(3_000)
            runCurrent()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content &&
                        it.request.status == TaskStatus.Completed &&
                        it.task.status == TaskStatus.Completed
                } as AgentTaskUiState.Content
            val readsNow = reads(requestPath)
            advanceTimeBy(60_000)
            runCurrent()

            assertNotNull(content.task.finishedAt)
            assertEquals("Pronto", content.statusLine)
            assertEquals(readsNow, reads(requestPath))
        }

    @Test
    fun `a re-read that fails keeps the last view and the next one tries again`() =
        runTest {
            var broken = false
            backend.route("GET", requestPath) { if (broken) status(503) else fixture("request-running") }
            backend.route("GET", taskPath, fixture("task-detail-agent"))
            backend.route("GET", "/api/requests/req-first", fixture("request-first"))
            val viewModel = newViewModel()
            viewModel.setVisible(true)
            viewModel.settled()
            val before = reads(requestPath)
            broken = true

            advanceTimeBy(3_000)
            runCurrent()
            awaitReads(requestPath, before + 1)
            withContext(Dispatchers.Default) { delay(100) }
            assertEquals(TaskStatus.Running, (viewModel.state.value as AgentTaskUiState.Content).request.status)

            broken = false
            advanceTimeBy(3_000)
            runCurrent()
            awaitReads(requestPath, before + 2)
            assertTrue(viewModel.state.value is AgentTaskUiState.Content)
        }

    @Test
    fun `the followed request is read right away and then every 3 seconds until it ends`() =
        runTest {
            serveAgent("request-done")
            backend.route("POST", "/api/requests", fixture("request-accepted").setResponseCode(202))
            var finished = false
            backend.route(
                "GET",
                "/api/requests/req-new",
            ) { if (finished) fixture("request-follow-done") else fixture("request-follow-running") }
            val viewModel = newViewModel()
            viewModel.setVisible(true)
            viewModel.settled()

            viewModel.onDraftChange("Só voos diretos")
            viewModel.send()
            viewModel.state.first { it is AgentTaskUiState.Content && it.composer.followed != null }
            assertEquals(1, reads("/api/requests/req-new"))

            finished = true
            advanceTimeBy(3_000)
            runCurrent()
            val content =
                viewModel.state.first {
                    it is AgentTaskUiState.Content && it.composer.followed?.status == TaskStatus.Completed
                } as AgentTaskUiState.Content
            val readsNow = reads("/api/requests/req-new")
            advanceTimeBy(60_000)
            runCurrent()

            assertEquals("Pronto", content.statusLine)
            assertEquals(readsNow, reads("/api/requests/req-new"))
            assertTrue(Fixtures.text("request-follow-done").isNotEmpty())
        }

    @Test
    fun `the microphone only dictates into the footer field, never sending`() =
        runTest {
            serveAgent()
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.onDraftChange("Só voos")

            assertTrue(viewModel.voice.value.available)
            viewModel.toggleVoice()
            assertTrue(speech.listening)
            assertTrue(viewModel.voice.value.listening)

            speech.hear("diretos" to true)
            advanceTimeBy(60_000)
            runCurrent()
            assertTrue(speech.listening)
            viewModel.toggleVoice()

            assertFalse(speech.listening)
            assertEquals("Só voos diretos", (viewModel.state.value as AgentTaskUiState.Content).composer.draft)
            assertTrue(backend.requestsTo("POST", "/api/requests").isEmpty())
        }

    @Test
    fun `without the microphone permission the system is asked and a refusal explains itself`() =
        runTest {
            serveAgent()
            microphone.granted = false
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.toggleVoice()
            assertTrue(viewModel.voice.value.askPermission)
            assertFalse(speech.listening)

            viewModel.microphoneResult(false)
            assertEquals("Permita o acesso ao microfone para gravar.", viewModel.voice.value.notice)
            viewModel.toggleVoice()
            viewModel.microphoneResult(true)
            assertTrue(speech.listening)
        }

    @Test
    fun `sending closes the microphone`() =
        runTest {
            serveAgent()
            backend.route("POST", "/api/requests", fixture("request-accepted").setResponseCode(202))
            backend.route("GET", "/api/requests/req-new", fixture("request-follow-running"))
            val viewModel = newViewModel()
            viewModel.settled()

            viewModel.toggleVoice()
            speech.hear("mais um" to true)
            viewModel.onDraftChange("Mais um")
            viewModel.send()
            assertFalse(speech.listening)
            assertEquals(1, speech.cancels)
        }

    @Test
    fun `leaving the screen turns the microphone off without delivering what was heard`() =
        runTest {
            serveAgent()
            val viewModel = newViewModel()
            viewModel.settled()
            viewModel.toggleVoice()
            speech.hear("não entregue" to true)

            viewModel.setVisible(false)

            assertFalse(speech.listening)
            assertEquals("", (viewModel.state.value as AgentTaskUiState.Content).composer.draft)
        }
}
