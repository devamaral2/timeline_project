package app.braid.mobile.domain.chat

import app.braid.mobile.data.chat.DefaultChatRepository
import app.braid.mobile.data.requests.RequestsApi
import app.braid.mobile.data.session.StoredSession
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOffException
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.support.InMemoryModelSelectionStore
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * A escolha de modelo do app (o que o chat e a barra de edição dos detalhes dividem) pela rede: o repositório real, com
 * Retrofit e OkHttp reais, contra o servidor de teste. Só o armazenamento da escolha é trocado.
 */
class ModelSelectorTest {
    private val optionsPath = "/api/requests/model/options"
    private val sonnet = ModelSelection(ModelProvider.Anthropic, "claude-sonnet-5-5", ModelEffort.Medium)

    private lateinit var backend: TestBackend
    private lateinit var selector: ModelSelector
    private val store = InMemoryModelSelectionStore()

    @Before
    fun setUp() {
        backend = TestBackend()
        val graph = TestGraph(backend)
        graph.storage.session = StoredSession("access", "refresh", "user-1", "ana@example.com", "Ana")
        runBlocking { graph.sessionRepository.restore() }
        selector = ModelSelector(DefaultChatRepository(graph.apis.create(RequestsApi::class.java)), store)
    }

    @After
    fun tearDown() = backend.close()

    private fun reads(): Int = backend.requestsTo("GET", optionsPath).size

    private fun state(): ModelSelectorState = selector.state.value

    @Test
    fun `a read that fails keeps what was read before, and the mode turned off drops the picker but not the choice`() =
        runBlocking {
            backend.route("GET", optionsPath, fixture("chat-model-options"), status(500), status(404))

            selector.load()
            assertEquals(sonnet, state().picker?.selection)
            selector.chooseEffort(ModelEffort.High)

            // O servidor falhou nesta leitura: o seletor segue com as opções de antes.
            selector.load()
            assertEquals(sonnet.copy(effort = ModelEffort.High), state().picker?.selection)

            // O modo modelo foi desligado (nenhum provedor com chave): sem seletor, e os pedidos vão sem modelo.
            selector.load()
            assertNull(state().picker)
            assertNull(state().options)
            assertEquals(ModelEffort.High, state().selection?.effort)
            assertEquals(ModelEffort.High, store.stored?.current?.effort)
            assertEquals(3, reads())
        }

    @Test
    fun `screens that ask at the same time share one read, and the options read are reused`() =
        runBlocking {
            backend.route("GET", optionsPath, fixture("chat-model-options"))

            val pickers = listOf(async { selector.picker() }, async { selector.picker() }).awaitAll()

            assertEquals(listOf(sonnet, sonnet), pickers.map { it.selection })
            assertEquals(sonnet, selector.picker().selection)
            assertEquals(sonnet, selector.selectionForRequest())
            assertEquals(1, reads())
            // Um campo que aparece lê de novo, para a lista não envelhecer; dois ao mesmo tempo dividem a leitura.
            listOf(async { selector.load() }, async { selector.load() }).awaitAll()
            assertEquals(2, reads())
        }

    @Test
    fun `without a provider key asking for the picker says the mode is off`() =
        runBlocking {
            backend.route("GET", optionsPath, status(404))

            val failure = runCatching { selector.picker() }.exceptionOrNull()

            assertTrue(failure is ModelOffException)
            assertNull(state().picker)
            // Sem as opções não há o que trocar.
            selector.chooseEffort(ModelEffort.Max)
            assertNull(state().selection)
            assertNull(store.stored)

            // O modo desligado fica lembrado: o pedido vai sem escolha e não pergunta de novo ao servidor.
            assertNull(selector.selectionForRequest())
            assertTrue(runCatching { selector.picker() }.exceptionOrNull() is ModelOffException)
            assertEquals(1, reads())
            // Quem pede o modo modelo quer saber agora se ele existe.
            assertTrue(runCatching { selector.picker(askAgain = true) }.exceptionOrNull() is ModelOffException)
            assertEquals(2, reads())
        }

    @Test
    fun `a read that failed for another reason is not remembered, and the next request asks again`() =
        runBlocking {
            backend.route("GET", optionsPath, status(500), fixture("chat-model-options"))

            assertNull(selector.selectionForRequest())
            assertNull(state().picker)

            assertEquals(sonnet, selector.selectionForRequest())
            assertEquals(sonnet, state().picker?.selection)
            assertEquals(2, reads())
        }

    @Test
    fun `a row of another provider changes provider and model together, and keeps what each provider remembered`() =
        runBlocking {
            backend.route("GET", optionsPath, fixture("chat-model-options"))
            selector.load()

            selector.chooseModel("google/gemini-4-neon", ModelProvider.OpenRouter)
            assertEquals(ModelSelection(ModelProvider.OpenRouter, "google/gemini-4-neon", ModelEffort.Medium), state().picker?.selection)

            // O modelo da Anthropic que a linha traz vale; o do OpenRouter fica guardado para quando ele voltar.
            selector.chooseModel("claude-opus-5-5", ModelProvider.Anthropic)
            assertEquals(ModelSelection(ModelProvider.Anthropic, "claude-opus-5-5", ModelEffort.Medium), state().picker?.selection)
            assertEquals("google/gemini-4-neon", store.stored?.models?.get(ModelProvider.OpenRouter))
            selector.chooseProvider(ModelProvider.OpenRouter)
            assertEquals("google/gemini-4-neon", state().picker?.selection?.model)

            // Um modelo que o provedor pedido não oferece, ou um provedor que o servidor não oferece, não muda nada.
            val before = state().picker?.selection
            selector.chooseModel("claude-opus-5-5", ModelProvider.OpenRouter)
            selector.chooseModel("gpt-6.2-sol", ModelProvider.OpenAi)
            assertEquals(before, state().picker?.selection)
        }

    @Test
    fun `the star saves a favorite without choosing it, and the list is kept in the order saved`() =
        runBlocking {
            backend.route("GET", optionsPath, fixture("chat-model-options"))
            selector.load()
            val gemini = ModelFavorite(ModelProvider.OpenRouter, "google/gemini-4-neon")
            val opus = ModelFavorite(ModelProvider.Anthropic, "claude-opus-5-5")

            selector.toggleFavorite(gemini.provider, gemini.model)
            selector.toggleFavorite(opus.provider, opus.model)

            assertEquals(listOf(gemini, opus), state().picker?.favorites)
            assertEquals(listOf(gemini, opus), store.favorites)
            assertEquals(sonnet, state().picker?.selection)

            // Ler as opções de novo não desfaz o que a pessoa acabou de marcar.
            selector.load()
            assertEquals(listOf(gemini, opus), state().picker?.favorites)

            selector.toggleFavorite(gemini.provider, gemini.model)
            assertEquals(listOf(opus), store.favorites)
        }

    @Test
    fun `the favorites stored on the device come with the first read`() =
        runBlocking {
            val kept = listOf(ModelFavorite(ModelProvider.OpenAi, "gpt-6.2-sol"), ModelFavorite(ModelProvider.Anthropic, "claude-opus-5-5"))
            store.favorites = kept
            backend.route("GET", optionsPath, fixture("chat-model-options"))

            // A lista guarda também o que o servidor já não oferece (a OpenAI); quem a mostra é que filtra.
            assertEquals(kept, selector.picker().favorites)
        }
}
