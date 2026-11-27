package app.braid.mobile.ui.aiedit

import app.braid.mobile.data.chat.DefaultChatRepository
import app.braid.mobile.data.requests.DefaultAgentRequestRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.chat.ModelSelector
import app.braid.mobile.domain.chat.StoredModelSelection
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.domain.request.editEntityTypeOfArtifact
import app.braid.mobile.domain.speech.SpeechError
import app.braid.mobile.support.FakeMicrophone
import app.braid.mobile.support.FakeSpeechRecognizer
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.InMemoryModelSelectionStore
import app.braid.mobile.support.MutableClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.stopAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
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
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

private const val POLL_MS = 3_000L

/**
 * A barra de edição por IA dos detalhes pela rede: o ViewModel real, com Retrofit e OkHttp reais, contra o servidor de
 * teste. Só o relógio, o reconhecedor de voz e a permissão de microfone são trocados.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EntityEditViewModelTest {
    private val editPath = "/api/requests/edit"
    private val requestPath = "/api/requests/req-ed"
    private val optionsPath = "/api/requests/model/options"

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val clock = MutableClock(Instant.parse("2026-09-14T14:00:00.000Z"))
    private val speech = FakeSpeechRecognizer()
    private val microphone = FakeMicrophone()
    private val modelStore = InMemoryModelSelectionStore()
    private val created = mutableListOf<EntityEditViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        graph.storage.session = StoredSession("access", "refresh", "user-1", "ana@example.com", "Ana")
        backend.route("POST", editPath, fixture("entity-edit-accepted", code = 202))
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        backend.close()
        Dispatchers.resetMain()
    }

    private suspend fun newViewModel(
        type: EditEntityType = EditEntityType.Task,
        id: String = "task-1",
    ): EntityEditViewModel {
        graph.sessionRepository.restore()
        val api = graph.apis.create(RequestsApi::class.java)
        return EntityEditViewModel(
            type,
            id,
            DefaultAgentRequestRepository(api),
            graph.sessionRepository,
            clock,
            speech,
            microphone,
            ModelSelector(DefaultChatRepository(api), modelStore),
        ).also(created::add)
    }

    private suspend fun EntityEditViewModel.until(predicate: (EntityEditUiState) -> Boolean): EntityEditUiState =
        withContext(Dispatchers.Default) { withTimeout(10_000) { state.first(predicate) } }

    private fun reads(path: String = requestPath): Int = backend.requestsTo("GET", path).size

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

    private fun body(request: RecordedRequest): JsonObject = Json.parseToJsonElement(request.body.peek().readUtf8()).jsonObject

    private fun edits(): List<JsonObject> = backend.requestsTo("POST", editPath).map(::body)

    private fun JsonObject.string(name: String) = getValue(name).jsonPrimitive.content

    /** A escolha de modelo que o pedido levou. */
    private fun JsonObject.selection() = getValue("model").jsonObject

    private suspend fun awaitOptionsReads(count: Int) =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) { while (reads(optionsPath) < count) delay(5) }
        }

    /** Escreve, envia e espera o pedido terminar; depois fecha o resultado, para a barra aceitar o próximo. */
    private suspend fun EntityEditViewModel.sendAndFinish(text: String) {
        onDraftChange(text)
        submit()
        until { it.phase == EditPhase.Done }
        dismiss()
    }

    /** Serve as fixtures do pedido uma por leitura (a última repete) e anota o relógio virtual de cada chegada. */
    private fun TestScope.servingInOrder(vararg names: String): List<Long> {
        val arrivals = CopyOnWriteArrayList<Long>()
        backend.route("GET", requestPath) {
            arrivals += testScheduler.currentTime
            fixture(names[minOf(arrivals.size, names.size) - 1])
        }
        return arrivals
    }

    private fun TestScope.collectEdits(viewModel: EntityEditViewModel): List<Unit> {
        val edits = CopyOnWriteArrayList<Unit>()
        backgroundScope.launch { viewModel.edited.collect { edits += it } }
        return edits
    }

    @Test
    fun `sending posts the type and the id of the entity, then reads the request every 3 seconds, the first one after the first wait`() =
        runTest {
            val arrivals = servingInOrder("entity-edit-running", "entity-edit-running", "entity-edit-done")
            val viewModel = newViewModel()
            val edits = collectEdits(viewModel)

            assertEquals("Esperando o seu pedido", viewModel.state.value.statusText)
            viewModel.onDraftChange("  Mude a reunião para as 15h  ")
            viewModel.submit()
            assertEquals("", viewModel.state.value.draft)

            val done = viewModel.until { it.phase == EditPhase.Done }
            val post = backend.requestsTo("POST", editPath).single()
            assertEquals("Bearer access", post.getHeader("Authorization"))
            assertEquals("user-1", body(post).getValue("userId").jsonPrimitive.content)
            assertEquals("Mude a reunião para as 15h", body(post).getValue("text").jsonPrimitive.content)
            assertEquals("task", body(post).getValue("entityType").jsonPrimitive.content)
            assertEquals("task-1", body(post).getValue("entityId").jsonPrimitive.content)
            assertFalse(body(post).containsKey("clientMessageId"))
            // Sem as opções de modelo (o servidor de teste responde 404) o campo é o simples e o pedido vai sem modelo.
            assertFalse(body(post).containsKey("model"))
            assertNull(done.picker)

            assertEquals("Pronto", done.statusText)
            assertEquals("Pronto: movi a reunião para as 15h.", done.message)
            assertFalse(done.failed)
            assertTrue(done.canDismiss)
            assertFalse(done.busy)
            // A primeira leitura vem 3 s depois do envio, e cada uma 3 s depois da anterior.
            assertEquals(listOf(POLL_MS, 2 * POLL_MS, 3 * POLL_MS), arrivals.toList())
            assertEquals(1, edits.size)

            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(3, reads())
        }

    @Test
    fun `while it runs the bar shows the progress, then the steps of the request`() =
        runTest {
            servingInOrder("entity-edit-queued")
            val viewModel = newViewModel()
            viewModel.onDraftChange("Mude")
            viewModel.submit()
            val sending = viewModel.until { it.phase == EditPhase.Running }
            assertEquals("Entendendo o pedido…", sending.statusText)
            assertTrue(sending.busy)
            assertFalse(sending.canDismiss)
            val queued = viewModel.until { it.request != null }
            assertEquals("Entendendo o pedido…", queued.statusText)

            servingInOrder("entity-edit-running")
            assertEquals("Ajustando a tarefa…", viewModel.until { it.request?.progress != null }.statusText)

            servingInOrder("entity-edit-running-steps")
            val steps = viewModel.until { it.request?.steps?.isNotEmpty() == true }
            assertEquals(listOf("Entender o pedido", "Mudar o horário", "Conferir a agenda"), steps.request?.steps?.map { it.label })
            assertEquals("Mudar o horário", steps.statusText)
            assertEquals(null, steps.message)
        }

    @Test
    fun `a request that changed nothing finishes without asking the screen to reload`() =
        runTest {
            servingInOrder("entity-edit-done-bare")
            val viewModel = newViewModel()
            val edits = collectEdits(viewModel)
            viewModel.onDraftChange("Mude")
            viewModel.submit()

            val done = viewModel.until { it.phase == EditPhase.Done }
            assertEquals("Nada a mudar.", done.message)
            assertEquals(0, edits.size)
        }

    @Test
    fun `news, an email summary and a transcript send the artifact target with their own id, as a text document does`() =
        runTest {
            servingInOrder("entity-edit-done")
            for (type in listOf(ArtifactType.Text, ArtifactType.News, ArtifactType.EmailSummary, ArtifactType.YoutubeTranscript)) {
                val target = checkNotNull(editEntityTypeOfArtifact(type, global = false))
                val viewModel = newViewModel(target, "art-${type.code}")
                viewModel.sendAndFinish("Resuma em duas linhas")

                val post = backend.requestsTo("POST", editPath).map(::body).last()
                assertEquals(type.code, "artifact", post.getValue("entityType").jsonPrimitive.content)
                assertEquals("art-${type.code}", post.getValue("entityId").jsonPrimitive.content)
                assertEquals("Resuma em duas linhas", post.getValue("text").jsonPrimitive.content)
            }
            assertEquals(4, backend.requestsTo("POST", editPath).size)
        }

    @Test
    fun `an entity of another type is sent with its own code`() =
        runTest {
            servingInOrder("entity-edit-done")
            val viewModel = newViewModel(EditEntityType.Training, "art-9")
            viewModel.onDraftChange("Acrescente um aquecimento")
            viewModel.submit()
            viewModel.until { it.phase == EditPhase.Done }

            val post = body(backend.requestsTo("POST", editPath).single())
            assertEquals("training_artifact", post.getValue("entityType").jsonPrimitive.content)
            assertEquals("art-9", post.getValue("entityId").jsonPrimitive.content)
        }

    @Test
    fun `a blank draft is not sent, and a second submit while one runs is ignored`() =
        runTest {
            servingInOrder("entity-edit-running")
            val viewModel = newViewModel()
            viewModel.onDraftChange("   ")
            viewModel.submit()
            assertEquals(0, backend.requestsTo("POST", editPath).size)

            viewModel.onDraftChange("Mude")
            viewModel.submit()
            viewModel.until { it.phase == EditPhase.Running }
            viewModel.onDraftChange("Mude de novo")
            viewModel.submit()
            // Só se fecha o resultado quando o pedido termina.
            viewModel.dismiss()

            assertEquals(1, backend.requestsTo("POST", editPath).size)
            assertEquals(EditPhase.Running, viewModel.state.value.phase)
            assertEquals("Mude de novo", viewModel.state.value.draft)
        }

    @Test
    fun `the draft is cut at 4000 characters`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.onDraftChange("a".repeat(4_500))
            assertEquals(4_000, viewModel.state.value.draft.length)
        }

    @Test
    fun `a start that fails says why and gives the text back`() =
        runTest {
            // O 401 fica por último: ele renova a sessão, e o refresh sem rota a apaga.
            val cases =
                listOf(
                    503 to "A IA está indisponível agora. Tente de novo em instantes.",
                    400 to "Não consegui ler essa mensagem. Tente escrever de outro jeito.",
                    500 to "Não consegui conectar ao assistente. Tente de novo.",
                    401 to "Sua sessão acabou. Entre de novo para continuar.",
                )
            val viewModel = newViewModel()
            for ((code, text) in cases) {
                backend.route("POST", editPath, status(code))
                viewModel.onDraftChange("Mude a reunião")
                viewModel.submit()

                val failed = viewModel.until { it.phase == EditPhase.Failed }
                assertEquals(text, failed.message)
                assertEquals("Não deu certo", failed.statusText)
                assertEquals("Mude a reunião", failed.draft)
                assertEquals(0, reads())
                viewModel.dismiss()
                assertEquals(EditPhase.Idle, viewModel.state.value.phase)
            }
        }

    @Test
    fun `a request that fails shows the reason of its code, or the generic one`() =
        runTest {
            servingInOrder("entity-edit-failed")
            val viewModel = newViewModel()
            viewModel.onDraftChange("Mude")
            viewModel.submit()
            val failed = viewModel.until { it.phase == EditPhase.Failed }
            assertEquals("O pedido ficou grande demais e nada foi gravado. Tente dividir em partes menores.", failed.message)
            assertEquals("Não deu certo", failed.statusText)
            assertTrue(failed.canDismiss)

            viewModel.dismiss()
            assertEquals(EditPhase.Idle, viewModel.state.value.phase)
            assertNull(viewModel.state.value.message)
            assertEquals("Esperando o seu pedido", viewModel.state.value.statusText)

            servingInOrder("entity-edit-failed-bare")
            viewModel.onDraftChange("Mude outra vez")
            viewModel.submit()
            val bare = viewModel.until { it.phase == EditPhase.Failed }
            assertEquals("Algo deu errado. Tente de novo.", bare.message)
        }

    @Test
    fun `a cancelled request reads as cancelled and fails the bar`() =
        runTest {
            servingInOrder("entity-edit-cancelled")
            val viewModel = newViewModel()
            val edits = collectEdits(viewModel)
            viewModel.onDraftChange("Mude")
            viewModel.submit()

            val failed = viewModel.until { it.phase == EditPhase.Failed }
            assertEquals("Pedido cancelado.", failed.message)
            assertEquals("Não deu certo", failed.statusText)
            assertEquals(0, edits.size)
        }

    @Test
    fun `five reads in a row that fail give up with the lost-connection text, and a success resets the count`() =
        runTest {
            var reading = 0
            backend.route("GET", requestPath) {
                reading += 1
                // Quatro falhas, uma leitura boa, e depois falhas sem parar: só as cinco seguidas desistem.
                if (reading == 5) fixture("entity-edit-running") else status(503)
            }
            val viewModel = newViewModel()
            viewModel.onDraftChange("Mude")
            viewModel.submit()

            val lost = viewModel.until { it.phase == EditPhase.Failed }
            assertEquals("Perdi a conexão antes da resposta. Confira se a mudança foi feita antes de repetir.", lost.message)
            assertEquals(10, reads())
        }

    @Test
    fun `a request that outlives 180 seconds gives up with the timeout text`() =
        runTest {
            backend.route("GET", requestPath) {
                clock.advance(Duration.ofSeconds(100))
                fixture("entity-edit-running")
            }
            val viewModel = newViewModel()
            viewModel.onDraftChange("Mude")
            viewModel.submit()

            val failed = viewModel.until { it.phase == EditPhase.Failed }
            assertEquals("O pedido demorou demais. Confira se a mudança foi feita antes de repetir.", failed.message)
            assertEquals(2, reads())
        }

    @Test
    fun `the request is not followed out of sight`() =
        runTest {
            servingInOrder("entity-edit-running")
            val viewModel = newViewModel()
            viewModel.setVisible(false)
            viewModel.onDraftChange("Mude")
            viewModel.submit()
            viewModel.until { it.phase == EditPhase.Running }

            advanceTimeBy(60_000)
            runCurrent()
            assertEquals(0, reads())

            viewModel.setVisible(true)
            awaitReads(1)
            assertNotNull(viewModel.until { it.request != null }.request)
        }

    private val sonnet = ModelSelection(ModelProvider.Anthropic, "claude-sonnet-5-5", ModelEffort.Medium)

    @Test
    fun `the bar reads the model options when it appears and shows the picker of the chat`() =
        runTest {
            backend.route("GET", optionsPath, fixture("chat-model-options"))
            val viewModel = newViewModel()

            val picker = requireNotNull(viewModel.until { it.picker != null }.picker)

            assertEquals(sonnet, picker.selection)
            assertEquals(listOf("Anthropic", "OpenRouter"), picker.options.providers.map { it.name })
            assertEquals("Bearer access", backend.requestsTo("GET", optionsPath).single().getHeader("Authorization"))
            // A escolha conferida contra as opções fica no aparelho, onde o chat também a lê.
            assertEquals(sonnet, modelStore.stored?.current)
        }

    @Test
    fun `the request carries the current selection, and a change in the picker is saved and goes in the next one`() =
        runTest {
            backend.route("GET", optionsPath, fixture("chat-model-options"))
            servingInOrder("entity-edit-done")
            val viewModel = newViewModel()
            viewModel.until { it.picker != null }

            viewModel.sendAndFinish("Mude a reunião para as 15h")
            // A escolha padrão do servidor, na forma do contrato (`modelSelectionSchema`).
            assertEquals(Fixtures.json("chat-model-options").jsonObject.getValue("default"), edits().single().getValue("model"))

            viewModel.chooseModel("google/gemini-4-neon", ModelProvider.OpenRouter)
            viewModel.chooseEffort(ModelEffort.Max)
            // Um modelo que o provedor não tem não vale.
            viewModel.chooseModel("claude-opus-5-5")
            val picked = ModelSelection(ModelProvider.OpenRouter, "google/gemini-4-neon", ModelEffort.Max)
            assertEquals(
                picked,
                viewModel.state.value.picker
                    ?.selection,
            )
            assertEquals(picked, modelStore.stored?.current)

            viewModel.sendAndFinish("Mude de novo")
            val second = edits()[1]
            assertEquals("openrouter", second.selection().string("provider"))
            assertEquals("google/gemini-4-neon", second.selection().string("model"))
            assertEquals("max", second.selection().string("effort"))
            assertEquals("Mude de novo", second.string("text"))
        }

    @Test
    fun `the picker changes while a request runs, and the change waits for the next request`() =
        runTest {
            backend.route("GET", optionsPath, fixture("chat-model-options"))
            servingInOrder("entity-edit-running")
            val viewModel = newViewModel()
            viewModel.until { it.picker != null }
            viewModel.onDraftChange("Mude")
            viewModel.submit()
            viewModel.until { it.phase == EditPhase.Running }

            viewModel.chooseEffort(ModelEffort.High)

            val running = viewModel.state.value
            assertTrue(running.busy)
            assertEquals(sonnet.copy(effort = ModelEffort.High), running.picker?.selection)
            assertEquals(ModelEffort.High, modelStore.stored?.current?.effort)
            // O pedido em andamento saiu com a escolha de antes.
            assertEquals("medium", edits().single().selection().string("effort"))
        }

    @Test
    fun `a saved selection is checked against the options before it shows and goes in the request`() =
        runTest {
            backend.route("GET", optionsPath, fixture("chat-model-options"))
            servingInOrder("entity-edit-done")
            // O que o chat deixou guardado: um modelo que saiu da lista vira o padrão do provedor; o esforço vale.
            modelStore.stored = StoredModelSelection(sonnet.copy(model = "claude-velho", effort = ModelEffort.High))
            val viewModel = newViewModel()

            val shown = viewModel.until { it.picker != null }
            assertEquals(sonnet.copy(effort = ModelEffort.High), shown.picker?.selection)

            viewModel.sendAndFinish("Mude")
            val model = edits().single().selection()
            assertEquals("claude-sonnet-5-5", model.string("model"))
            assertEquals("high", model.string("effort"))
        }

    @Test
    fun `with the model mode off the bar has no picker, and coming back to the screen tries again`() =
        runTest {
            backend.route("GET", optionsPath, status(404), fixture("chat-model-options"))
            servingInOrder("entity-edit-done")
            val viewModel = newViewModel()
            awaitOptionsReads(1)

            viewModel.sendAndFinish("Mude")
            assertNull(viewModel.state.value.picker)
            assertFalse(edits().single().containsKey("model"))
            // O modo desligado fica lembrado: o pedido não pergunta de novo ao servidor.
            assertEquals(1, reads(optionsPath))

            viewModel.setVisible(false)
            viewModel.setVisible(true)
            val shown = viewModel.until { it.picker != null }

            assertEquals(sonnet, shown.picker?.selection)
            assertEquals(2, reads(optionsPath))
            viewModel.sendAndFinish("Mude de novo")
            assertEquals(Fixtures.json("chat-model-options").jsonObject.getValue("default"), edits()[1].getValue("model"))
        }

    @Test
    fun `a request sent before the options arrive waits for them and carries the selection`() =
        runTest {
            // As opções só chegam depois de o pedido já ter sido enviado pela pessoa.
            val release = CountDownLatch(1)
            backend.route("GET", optionsPath) {
                release.await(5, TimeUnit.SECONDS)
                fixture("chat-model-options")
            }
            servingInOrder("entity-edit-done")
            val viewModel = newViewModel()
            awaitOptionsReads(1)
            viewModel.onDraftChange("Mude")
            viewModel.submit()
            assertEquals(EditPhase.Sending, viewModel.state.value.phase)
            assertEquals(0, edits().size)

            release.countDown()
            viewModel.until { it.phase == EditPhase.Done }

            assertEquals(Fixtures.json("chat-model-options").jsonObject.getValue("default"), edits().single().getValue("model"))
            assertEquals(1, reads(optionsPath))
        }

    @Test
    fun `the microphone only dictates, adding what was heard to the field and never sending`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.onDraftChange("Mude a reunião")
            viewModel.toggleVoice()
            assertTrue(speech.listening)
            assertEquals("Ouvindo…", viewModel.state.value.statusText)
            assertTrue(viewModel.state.value.voice.listening)

            speech.hear("para as 15h" to true)
            // O silêncio não envia nem encerra: só a pessoa para a escuta.
            advanceTimeBy(60_000)
            runCurrent()
            assertTrue(speech.listening)
            assertEquals("Mude a reunião", viewModel.state.value.draft)

            viewModel.toggleVoice()

            assertFalse(speech.listening)
            assertEquals("Mude a reunião para as 15h", viewModel.state.value.draft)
            assertEquals("Esperando o seu pedido", viewModel.state.value.statusText)
            assertEquals(0, backend.requestsTo("POST", editPath).size)
        }

    @Test
    fun `dictating into an empty field starts the text, and the recognizer ending by itself still delivers it`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.toggleVoice()
            speech.hear("apague esta tarefa" to true)
            speech.end()

            assertEquals("apague esta tarefa", viewModel.state.value.draft)
            assertEquals(0, backend.requestsTo("POST", editPath).size)
        }

    @Test
    fun `without the microphone permission the system is asked, and a refusal explains itself`() =
        runTest {
            microphone.granted = false
            val viewModel = newViewModel()
            viewModel.toggleVoice()

            assertTrue(viewModel.state.value.voice.askPermission)
            assertFalse(speech.listening)

            viewModel.microphoneResult(false)
            assertFalse(viewModel.state.value.voice.askPermission)
            assertEquals("Permita o acesso ao microfone para gravar.", viewModel.state.value.voice.notice)
            assertFalse(speech.listening)

            viewModel.toggleVoice()
            assertNull(viewModel.state.value.voice.notice)
            viewModel.microphoneResult(true)
            assertTrue(speech.listening)
            assertNull(viewModel.state.value.voice.notice)
        }

    @Test
    fun `a speech error shows its text`() =
        runTest {
            val viewModel = newViewModel()
            assertTrue(viewModel.state.value.voice.available)
            viewModel.toggleVoice()
            speech.fail(SpeechError.NoSpeech)

            assertEquals("Não ouvi nada. Tente de novo.", viewModel.state.value.voice.notice)
        }

    @Test
    fun `a device without recognition has no microphone`() =
        runTest {
            speech.available = false
            val viewModel = newViewModel()
            viewModel.toggleVoice()

            // Sem reconhecimento o botão nem aparece: a tela lê `available`.
            assertFalse(viewModel.state.value.voice.available)
            assertEquals(0, speech.starts)
        }

    @Test
    fun `sending closes the microphone`() =
        runTest {
            servingInOrder("entity-edit-running")
            val viewModel = newViewModel()
            viewModel.toggleVoice()
            speech.hear("mude" to true)
            viewModel.onDraftChange("Mude")
            viewModel.submit()

            assertFalse(speech.listening)
            assertEquals(1, speech.cancels)
            viewModel.until { it.phase == EditPhase.Running }
        }

    @Test
    fun `leaving the screen turns the microphone off without delivering what was heard`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.toggleVoice()
            speech.hear("mude" to true)
            viewModel.setVisible(false)

            assertFalse(speech.listening)
            assertFalse(viewModel.state.value.voice.listening)
            assertEquals("", viewModel.state.value.draft)
        }
}
