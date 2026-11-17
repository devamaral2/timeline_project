package app.braid.mobile.ui.agentfile

import app.braid.mobile.data.agentfiles.AgentFilesApi
import app.braid.mobile.data.agentfiles.DefaultAgentFileRepository
import app.braid.mobile.data.requests.DefaultAgentRequestRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.domain.artifact.AgentFileData
import app.braid.mobile.support.FakeMicrophone
import app.braid.mobile.support.FakeSpeechRecognizer
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.stopAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList

private const val POLL_MS = 3_000L

/** A vista do arquivo do agente pela rede: texto, backups, restauração e o pedido de edição acompanhado a cada 3 s. */
@OptIn(ExperimentalCoroutinesApi::class)
class AgentFileViewModelTest {
    private val path = "hermes/skills/pesquisar/SKILL.md"
    private val filePath = "/api/ai/config/file"
    private val backupsPath = "/api/ai/config/backups"
    private val restorePath = "/api/ai/config/restore"
    private val editPath = "/api/ai/config/edit-request"
    private val requestPath = "/api/requests/req-edit"

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val speech = FakeSpeechRecognizer()
    private val microphone = FakeMicrophone()
    private val created = mutableListOf<AgentFileViewModel>()

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

    private fun serveOwner() {
        backend.route("GET", filePath, fixture("agent-file-text"))
        backend.route("GET", backupsPath, fixture("agent-file-backups"))
    }

    private fun newViewModel(
        hash: String = "abc12345deadbeef",
        missing: Boolean = false,
    ): AgentFileViewModel =
        AgentFileViewModel(
            AgentFileData(path, hash, missing, "Pesquisa na web"),
            DefaultAgentFileRepository(graph.apis.create(AgentFilesApi::class.java)),
            DefaultAgentRequestRepository(graph.apis.create(RequestsApi::class.java)),
            speech,
            microphone,
        ).also(created::add)

    private suspend fun AgentFileViewModel.ready(): AgentFileUiState =
        state.first {
            it.read !is FileRead.Loading &&
                it.backups !is BackupsState.Loading &&
                it.backups !is BackupsState.Idle ||
                it.forbidden
        }

    private suspend fun AgentFileViewModel.until(predicate: (AgentFileUiState) -> Boolean): AgentFileUiState = state.first(predicate)

    private fun reads(
        method: String,
        path: String,
    ): Int = backend.requestsTo(method, path).size

    private suspend fun awaitReads(
        path: String,
        count: Int,
    ) = withContext(Dispatchers.Default) { withTimeout(5_000) { while (reads("GET", path) < count) delay(5) } }

    private suspend fun settle() = withContext(Dispatchers.Default) { delay(100) }

    /** Serve as fixtures do pedido uma por leitura (a última repete) e anota o relógio virtual de cada chegada. */
    private fun TestScope.servingInOrder(vararg names: String): List<Long> {
        val arrivals = CopyOnWriteArrayList<Long>()
        backend.route("GET", requestPath) {
            arrivals += testScheduler.currentTime
            fixture(names[minOf(arrivals.size, names.size) - 1])
        }
        return arrivals
    }

    private fun body(request: RecordedRequest): JsonObject = Json.parseToJsonElement(request.body.peek().readUtf8()).jsonObject

    @Test
    fun `the owner reads the text, then the backups, with the path in the query`() =
        runTest {
            serveOwner()
            val state = newViewModel().ready()

            val read = state.read as FileRead.Ready
            assertTrue(read.text.startsWith("---\nname: pesquisar"))
            assertEquals(listOf("bk-3", "bk-2", "bk-1"), (state.backups as BackupsState.Ready).backups.map { it.id })
            assertEquals(
                path,
                backend
                    .requestsTo("GET", filePath)
                    .single()
                    .requestUrl
                    ?.queryParameter("path"),
            )
            assertEquals(
                path,
                backend
                    .requestsTo("GET", backupsPath)
                    .single()
                    .requestUrl
                    ?.queryParameter("path"),
            )
            assertEquals("abc12345deadbeef", state.hash)
            assertFalse(state.missing)
            assertFalse(state.raw)
            assertFalse(state.forbidden)
        }

    @Test
    fun `someone who is not the owner gets no text, no backups and no error`() =
        runTest {
            backend.route("GET", filePath, status(403))
            backend.route("GET", backupsPath, fixture("agent-file-backups"))

            val state = newViewModel().ready()

            assertEquals(FileRead.Forbidden, state.read)
            assertTrue(state.forbidden)
            assertEquals(BackupsState.Idle, state.backups)
            assertEquals(0, reads("GET", backupsPath))
        }

    @Test
    fun `a failed read says so, and the backups are still asked for`() =
        runTest {
            backend.route("GET", filePath, status(404))
            backend.route("GET", backupsPath, fixture("agent-file-backups-empty"))

            val state = newViewModel().ready()

            assertEquals(FileRead.Error, state.read)
            assertFalse(state.forbidden)
            assertEquals(BackupsState.Ready(emptyList()), state.backups)
            assertEquals("Não foi possível ler o arquivo.", FILE_READ_FAILED_TEXT)
        }

    @Test
    fun `a failure to load the backups is its own error`() =
        runTest {
            backend.route("GET", filePath, fixture("agent-file-text"))
            backend.route("GET", backupsPath, status(500))

            val state = newViewModel().ready()

            assertTrue(state.read is FileRead.Ready)
            assertEquals(BackupsState.Error, state.backups)
        }

    @Test
    fun `the view switches between markdown and the raw text`() =
        runTest {
            serveOwner()
            val viewModel = newViewModel()
            viewModel.ready()

            viewModel.setRaw(true)
            assertTrue(viewModel.state.value.raw)
            viewModel.setRaw(false)
            assertFalse(viewModel.state.value.raw)
        }

    @Test
    fun `restoring asks first, posts the backup id and takes the new version from the reply`() =
        runTest {
            backend.route("GET", filePath, fixture("agent-file-text"), fixture("agent-file-text-restored"))
            backend.route("GET", backupsPath, fixture("agent-file-backups"), fixture("agent-file-backups-after-restore"))
            backend.route("POST", restorePath, fixture("agent-file-restore-missing", code = 201))
            val viewModel = newViewModel()
            val first = viewModel.ready()
            val backup = (first.backups as BackupsState.Ready).backups[1]

            viewModel.askRestore(backup)
            assertEquals(
                backup,
                viewModel.state.value.restore
                    ?.backup,
            )
            assertEquals(0, reads("POST", restorePath))
            viewModel.cancelRestore()
            assertNull(viewModel.state.value.restore)

            viewModel.askRestore(backup)
            viewModel.confirmRestore()
            val state =
                viewModel.until {
                    it.restore == null &&
                        (it.read as? FileRead.Ready)?.text?.contains("restaurada") == true &&
                        (it.backups as? BackupsState.Ready)?.backups?.size == 4
                }

            val request = backend.requestsTo("POST", restorePath).single()
            assertEquals(path, body(request).getValue("path").jsonPrimitive.content)
            assertEquals("bk-2", body(request).getValue("backupId").jsonPrimitive.content)
            assertEquals("99887766aabbccdd", state.hash)
            assertTrue(state.missing)
            // O texto que a restauração substituiu virou um backup novo: a lista o traz, e ele também se restaura.
            assertEquals("bk-4", (state.backups as BackupsState.Ready).backups.first().id)
            assertEquals(2, reads("GET", filePath))
            assertEquals(2, reads("GET", backupsPath))
        }

    @Test
    fun `restoring a backup that leaves the same version does not read the text again`() =
        runTest {
            backend.route("GET", filePath, fixture("agent-file-text"))
            backend.route("GET", backupsPath, fixture("agent-file-backups"), fixture("agent-file-backups-after-restore"))
            backend.route("POST", restorePath, fixture("agent-file-restore", code = 201))
            val viewModel = newViewModel(hash = "99887766aabbccdd")
            val backup = (viewModel.ready().backups as BackupsState.Ready).backups[0]

            viewModel.askRestore(backup)
            viewModel.confirmRestore()
            viewModel.until { it.restore == null && (it.backups as? BackupsState.Ready)?.backups?.size == 4 }

            assertEquals(1, reads("GET", filePath))
        }

    @Test
    fun `a restoration that fails keeps the dialog open with the message`() =
        runTest {
            serveOwner()
            backend.route("POST", restorePath, status(500))
            val viewModel = newViewModel()
            val backup = (viewModel.ready().backups as BackupsState.Ready).backups[0]

            viewModel.askRestore(backup)
            viewModel.confirmRestore()
            val dialog = viewModel.until { it.restore?.error != null }.restore

            assertEquals("Não foi possível restaurar este backup. Tente novamente.", dialog?.error)
            assertFalse(dialog!!.busy)
            assertEquals("abc12345deadbeef", viewModel.state.value.hash)
            viewModel.cancelRestore()
            assertNull(viewModel.state.value.restore)
        }

    @Test
    fun `an edit request posts the path, the text and a stable id, then follows the request until it is done`() =
        runTest {
            backend.route("GET", filePath, fixture("agent-file-text"), fixture("agent-file-text-edited"))
            backend.route("GET", backupsPath, fixture("agent-file-backups"))
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            val arrivals = servingInOrder("agent-file-edit-running", "agent-file-edit-running-step", "agent-file-edit-done")
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.setVisible(true)

            assertEquals("Esperando o seu pedido", viewModel.state.value.edit.statusText)
            viewModel.onDraftChange("  Responda sempre em português  ")
            assertTrue(viewModel.state.value.edit.canSend)
            viewModel.send()
            val following = viewModel.until { it.edit.followed != null }.edit
            assertEquals("", following.draft)

            val post = backend.requestsTo("POST", editPath).single()
            assertEquals(path, body(post).getValue("path").jsonPrimitive.content)
            assertEquals("Responda sempre em português", body(post).getValue("request").jsonPrimitive.content)
            assertTrue(
                body(post)
                    .getValue("clientMessageId")
                    .jsonPrimitive.content
                    .isNotBlank(),
            )

            awaitReads(requestPath, 3)
            val done =
                viewModel.until {
                    it.edit.statusText == "Pronto" &&
                        (it.read as? FileRead.Ready)?.text?.contains(
                            "português",
                        ) == true
                }

            assertEquals("Pronto: acrescentei a regra de responder em português.", done.edit.message)
            assertFalse(done.edit.hasFailure)
            assertTrue(done.edit.canDismiss)
            assertFalse(done.edit.busy)
            // Cada leitura veio 3 s (de relógio virtual) depois da anterior.
            assertEquals(listOf(POLL_MS, POLL_MS), arrivals.zipWithNext { before, after -> after - before })
            // O pedido terminou: o texto foi relido uma vez, e o acompanhamento parou.
            assertEquals(2, reads("GET", filePath))
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(3, reads("GET", requestPath))
            assertEquals(2, reads("GET", filePath))
        }

    @Test
    fun `a request still queued says it is understanding it, then shows the progress`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            servingInOrder("agent-file-edit-running", "agent-file-edit-running-step")
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.onDraftChange("Mude")
            viewModel.send()

            val queued = viewModel.until { it.edit.followed != null }.edit
            assertEquals("Entendendo o pedido…", queued.statusText)
            assertTrue(queued.busy)
            assertNull(queued.message)

            viewModel.setVisible(true)
            val running = viewModel.until { it.edit.statusText == "Avaliando o impacto da mudança…" }.edit
            assertTrue(running.busy)
            assertFalse(running.canDismiss)
            assertEquals("Reescrevendo o arquivo", viewModel.until { it.edit.statusText == "Reescrevendo o arquivo" }.edit.statusText)
        }

    @Test
    fun `the request is not followed out of sight`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            backend.route("GET", requestPath, fixture("agent-file-edit-running"))
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.onDraftChange("Mude")
            viewModel.send()
            viewModel.until { it.edit.followed != null }

            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(0, reads("GET", requestPath))

            viewModel.setVisible(true)
            awaitReads(requestPath, 1)
            viewModel.setVisible(false)
            settle()
            val whenLeft = reads("GET", requestPath)
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(whenLeft, reads("GET", requestPath))
        }

    @Test
    fun `a request that fails says so with the reason and the text is read once more`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            backend.route("GET", requestPath, fixture("agent-file-edit-failed"))
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.setVisible(true)
            viewModel.onDraftChange("Mude")
            viewModel.send()

            val bar = viewModel.until { it.edit.statusText == "Não deu certo" }.edit

            assertEquals("A IA está indisponível agora. Tente de novo em instantes.", bar.message)
            assertTrue(bar.hasFailure)
            assertTrue(bar.canDismiss)
            awaitReads(filePath, 2)
        }

    @Test
    fun `a cancelled request says so`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            backend.route("GET", requestPath, fixture("agent-file-edit-cancelled"))
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.setVisible(true)
            viewModel.onDraftChange("Mude")
            viewModel.send()

            val bar = viewModel.until { it.edit.statusText == "Pedido cancelado" }.edit

            assertEquals("Pedido cancelado.", bar.message)
        }

    @Test
    fun `a done request without a message shows no text, and Fechar clears the result`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            backend.route("GET", requestPath, fixture("agent-file-edit-done-bare"))
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.setVisible(true)
            viewModel.onDraftChange("Mude")
            viewModel.send()
            val done = viewModel.until { it.edit.statusText == "Pronto" }.edit
            assertNull(done.shown)

            viewModel.dismiss()

            assertNull(viewModel.state.value.edit.followed)
            assertEquals("Esperando o seu pedido", viewModel.state.value.edit.statusText)
        }

    @Test
    fun `the result cannot be closed while the request is open`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            backend.route("GET", requestPath, fixture("agent-file-edit-running"))
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.onDraftChange("Mude")
            viewModel.send()
            viewModel.until { it.edit.followed != null }

            viewModel.dismiss()
            assertNotNull(viewModel.state.value.edit.followed)
            // E enquanto ele roda, outro pedido não parte.
            viewModel.onDraftChange("Outra coisa")
            viewModel.send()
            settle()
            assertEquals(1, reads("POST", editPath))
        }

    @Test
    fun `five failed reads in a row give up on the request`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            backend.route("GET", requestPath, status(503))
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.setVisible(true)
            viewModel.onDraftChange("Mude")
            viewModel.send()

            awaitReads(requestPath, 5)
            val bar = viewModel.until { it.edit.lost }.edit

            assertEquals("Não consegui acompanhar o pedido", bar.statusText)
            assertEquals("Perdi a conexão antes da resposta. Confira o arquivo antes de repetir.", bar.message)
            assertTrue(bar.hasFailure)
            assertTrue(bar.canDismiss)
            val count = reads("GET", requestPath)
            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(count, reads("GET", requestPath))

            viewModel.dismiss()
            assertFalse(viewModel.state.value.edit.lost)
            assertNull(viewModel.state.value.edit.followed)
        }

    @Test
    fun `one read that fails does not lose the request`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            var reads = 0
            backend.route("GET", requestPath) { if (reads++ == 0) status(503) else fixture("agent-file-edit-done") }
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.setVisible(true)
            viewModel.onDraftChange("Mude")
            viewModel.send()
            val bar = viewModel.until { it.edit.statusText == "Pronto" }.edit

            assertFalse(bar.lost)
        }

    @Test
    fun `with the Hermes off the field gives way to the notice, without an error`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, status(404))
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.onDraftChange("Mude")

            viewModel.send()
            val bar = viewModel.until { it.edit.hermesOff }.edit

            assertNull(bar.error)
            assertFalse(bar.sending)
            assertEquals("O Hermes está desligado neste servidor.", HERMES_OFF_TEXT)
        }

    @Test
    fun `a request that cannot start keeps the text and explains why`() =
        runTest {
            serveOwner()
            val statuses = listOf(400, 403, 409, 503, 500)
            val answers = ArrayDeque(statuses)
            backend.route("POST", editPath) { status(answers.removeFirst()) }
            val viewModel = newViewModel()
            viewModel.ready()
            val texts = mutableListOf<String?>()

            repeat(statuses.size) {
                viewModel.onDraftChange("Mude")
                viewModel.send()
                texts += viewModel.until { !it.edit.sending && it.edit.error != null }.edit.error
                assertEquals("Mude", viewModel.state.value.edit.draft)
            }

            assertEquals(
                listOf(
                    "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
                    "Você não tem permissão para acessar esses dados.",
                    "Os dados mudaram enquanto eu preparava a resposta. Nada foi gravado; tente de novo.",
                    "A IA está indisponível agora. Tente de novo em instantes.",
                    "Não consegui conectar ao assistente. Tente de novo.",
                ),
                texts,
            )
            assertTrue(viewModel.state.value.edit.hasFailure)
        }

    @Test
    fun `the draft is limited, and a blank one is not sent`() =
        runTest {
            serveOwner()
            val viewModel = newViewModel()
            viewModel.ready()

            viewModel.onDraftChange("a".repeat(4_100))
            assertEquals(4_000, viewModel.state.value.edit.draft.length)

            viewModel.onDraftChange("   ")
            assertFalse(viewModel.state.value.edit.canSend)
            viewModel.send()
            settle()
            assertEquals(0, reads("POST", editPath))
        }

    @Test
    fun `the microphone only dictates into the edit box, never sending`() =
        runTest {
            serveOwner()
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.onDraftChange("Troque o título")

            assertTrue(viewModel.state.value.edit.voice.available)
            viewModel.toggleVoice()
            assertTrue(speech.listening)
            assertTrue(viewModel.state.value.edit.voice.listening)
            assertEquals("Ouvindo…", viewModel.state.value.edit.statusText)

            speech.hear("para Pesquisar" to true)
            advanceTimeBy(60_000)
            runCurrent()
            assertTrue(speech.listening)
            viewModel.toggleVoice()

            assertFalse(speech.listening)
            assertEquals("Troque o título para Pesquisar", viewModel.state.value.edit.draft)
            settle()
            assertEquals(0, reads("POST", editPath))
        }

    @Test
    fun `without the microphone permission the system is asked and a refusal explains itself`() =
        runTest {
            serveOwner()
            microphone.granted = false
            val viewModel = newViewModel()
            viewModel.ready()

            viewModel.toggleVoice()
            assertTrue(viewModel.state.value.edit.voice.askPermission)
            assertFalse(speech.listening)

            viewModel.microphoneResult(false)
            assertEquals("Permita o acesso ao microfone para gravar.", viewModel.state.value.edit.voice.notice)
            viewModel.toggleVoice()
            viewModel.microphoneResult(true)
            assertTrue(speech.listening)
        }

    @Test
    fun `sending closes the microphone and keeps it off while the request is open`() =
        runTest {
            serveOwner()
            backend.route("POST", editPath, fixture("agent-file-edit-accepted", code = 202))
            servingInOrder("agent-file-edit-running")
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.setVisible(true)

            viewModel.toggleVoice()
            speech.hear("mude" to true)
            viewModel.onDraftChange("Mude")
            viewModel.send()
            assertFalse(speech.listening)
            assertEquals(1, speech.cancels)

            // Com o pedido aberto o microfone fica desligado, como a caixa.
            viewModel.until { it.edit.followed != null }
            viewModel.toggleVoice()
            assertFalse(speech.listening)
        }

    @Test
    fun `leaving the screen turns the microphone off without delivering what was heard`() =
        runTest {
            serveOwner()
            val viewModel = newViewModel()
            viewModel.ready()
            viewModel.setVisible(true)
            viewModel.toggleVoice()
            speech.hear("não entregue" to true)

            viewModel.setVisible(false)

            assertFalse(speech.listening)
            assertEquals("", viewModel.state.value.edit.draft)
        }
}
