package app.braid.mobile.ui.documents

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.artifacts.ArtifactsApi
import app.braid.mobile.data.artifacts.DefaultArtifactRepository
import app.braid.mobile.data.tasks.DefaultHumanTaskSearch
import app.braid.mobile.data.tasks.DefaultTaskEditRepository
import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.tasks.TaskEditApi
import app.braid.mobile.data.tasks.TaskPickerApi
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.chat.ChatCommand
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.stopAndJoin
import app.braid.mobile.ui.picker.PickerSearchStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
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

@OptIn(ExperimentalCoroutinesApi::class)
class DocumentEditViewModelTest {
    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val created = mutableListOf<DocumentEditViewModel>()

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

    private val clock = AppClock { Instant.parse("2026-09-14T15:30:00Z") }

    private fun newViewModel(
        documentId: String? = null,
        name: String? = null,
    ): DocumentEditViewModel =
        DocumentEditViewModel(
            SavedStateHandle(listOfNotNull(documentId?.let { "documentId" to it }, name?.let { "name" to it }).toMap()),
            DefaultArtifactRepository(graph.apis.create(ArtifactsApi::class.java)),
            DefaultHumanTaskSearch(
                graph.apis.create(TaskPickerApi::class.java),
                DefaultTaskRepository(graph.apis.create(TasksApi::class.java)),
                clock,
            ),
            DefaultTaskEditRepository(graph.apis.create(TaskEditApi::class.java), graph.apis.create(TaskDetailApi::class.java)),
            clock,
        ).also(created::add)

    /** A lista de tarefas de pessoa e a agenda em volta de hoje que a folha "Tarefas" lê. */
    private fun routeHumanTasks() {
        backend.route("GET", "/api/tasks/tracked") { request ->
            if (request.requestUrl?.queryParameter("q") == null) {
                fixture("document-edit-human-tracked")
            } else {
                fixture("document-edit-human-tracked-filtered")
            }
        }
        backend.route("GET", "/api/tasks", fixture("document-edit-human-agenda"))
    }

    private suspend fun DocumentEditViewModel.pickerReady(query: String = ""): List<String> =
        (
            state.first { state ->
                val picker = (state as? DocumentEditUiState.Form)?.taskPicker
                picker?.status == PickerSearchStatus.Ready && picker.query == query
            } as DocumentEditUiState.Form
        ).taskPicker!!.results.map { it.id }

    private suspend fun DocumentEditViewModel.settled(): DocumentEditUiState = state.first { it !is DocumentEditUiState.Loading }

    private fun DocumentEditViewModel.form(): DocumentEditUiState.Form = state.value as DocumentEditUiState.Form

    /** Espera o toque em Salvar terminar: a requisição sai por outro executor. */
    private suspend fun DocumentEditViewModel.saved(): DocumentEditUiState.Form =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) { state.first { (it as? DocumentEditUiState.Form)?.saving == false } as DocumentEditUiState.Form }
        }

    private fun body(request: RecordedRequest) = Json.parseToJsonElement(request.body.readUtf8())

    private fun posts(): List<RecordedRequest> = backend.requestsTo("POST", "/api/artifacts")

    private fun patches(): List<RecordedRequest> = backend.requestsTo("PATCH", "/api/artifacts/doc-text")

    private suspend fun DocumentEditViewModel.awaitSaved(): String =
        withContext(Dispatchers.Default) {
            withTimeout(
                5_000,
            ) { (state.first { (it as? DocumentEditUiState.Form)?.savedId != null } as DocumentEditUiState.Form).savedId!! }
        }

    // Criação

    @Test
    fun `the create form opens empty on a text document, with the name typed after the chat command`() =
        runTest {
            val form = newViewModel(name = "ideias").form()

            assertFalse(form.existing)
            assertEquals(NewDocumentKind.Text, form.kind)
            assertEquals("ideias", form.name)
            assertEquals("", form.body)
            assertEquals(EditorMode.Write, form.mode)
        }

    @Test
    fun `saving a new text document posts the full content with an idempotency key and opens the created document`() =
        runTest {
            backend.route("POST", "/api/artifacts", fixture("document-edit-create-response", 201))
            val viewModel = newViewModel()
            viewModel.setName("  Ideias  ")
            viewModel.setBody("## Plano\n\n- um\n- dois")
            viewModel.setTagText("Casa")
            viewModel.commitTag()
            viewModel.setTagText("ideias")
            viewModel.save()

            assertEquals("doc-new", viewModel.awaitSaved())

            val request = posts().single()
            assertEquals(Fixtures.json("document-edit-create-note-request"), body(request))
            assertTrue(request.getHeader("Idempotency-Key").orEmpty().isNotBlank())
        }

    @Test
    fun `a text document without a name omits it so the API picks one`() =
        runTest {
            backend.route("POST", "/api/artifacts", fixture("document-edit-create-response", 201))
            val viewModel = newViewModel()
            viewModel.setName("   ")
            viewModel.setBody("Só o texto")
            viewModel.save()
            viewModel.awaitSaved()

            assertEquals(Fixtures.json("document-edit-create-note-unnamed-request"), body(posts().single()))
        }

    @Test
    fun `a food is created from free text only, trimmed`() =
        runTest {
            backend.route("POST", "/api/artifacts", fixture("document-edit-create-response", 201))
            val viewModel = newViewModel()
            viewModel.selectKind(NewDocumentKind.Meal)
            viewModel.setName("ignorado")
            viewModel.setBody("ignorado")
            viewModel.setMeal("  Arroz, feijão e frango grelhado  ")
            viewModel.save()

            assertEquals("doc-new", viewModel.awaitSaved())
            assertEquals(Fixtures.json("document-edit-create-food-request"), body(posts().single()))
        }

    @Test
    fun `an empty text or empty food blocks the send with the web messages`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.setBody("   \n ")
            viewModel.save()
            assertEquals("Escreva o texto da nota.", viewModel.form().error)

            viewModel.selectKind(NewDocumentKind.Meal)
            assertNull(viewModel.form().error)
            viewModel.save()
            assertEquals("Escreva o que você comeu.", viewModel.form().error)

            assertTrue(backend.requests.isEmpty())
        }

    @Test
    fun `each kind keeps its own idempotency key, reused when the same body is sent again`() =
        runTest {
            backend.route("POST", "/api/artifacts", status(500), status(500), status(500), fixture("document-edit-create-response", 201))
            val viewModel = newViewModel()
            viewModel.setBody("Texto")
            viewModel.setMeal("Arroz")

            viewModel.save()
            viewModel.saved()
            viewModel.selectKind(NewDocumentKind.Meal)
            viewModel.save()
            viewModel.saved()
            viewModel.selectKind(NewDocumentKind.Text)
            viewModel.save()
            viewModel.saved()

            val keys = posts().map { it.getHeader("Idempotency-Key") }
            assertEquals(3, keys.size)
            assertNotEquals(keys[0], keys[1])
            assertEquals(keys[0], keys[2])
        }

    @Test
    fun `a body changed after a failed create gets a new idempotency key, and the same body keeps the old one`() =
        runTest {
            backend.route("POST", "/api/artifacts", status(500))
            val viewModel = newViewModel()
            viewModel.setBody("Primeiro texto")
            viewModel.save()
            viewModel.saved()

            viewModel.save()
            viewModel.saved()
            viewModel.setBody("Texto corrigido")
            viewModel.save()
            viewModel.saved()

            val keys = posts().map { it.getHeader("Idempotency-Key") }
            assertEquals(3, keys.size)
            assertEquals(keys[0], keys[1])
            assertNotEquals(keys[1], keys[2])
        }

    @Test
    fun `a meal changed after a failed create gets a new idempotency key too`() =
        runTest {
            backend.route("POST", "/api/artifacts", status(500))
            val viewModel = newViewModel()
            viewModel.selectKind(NewDocumentKind.Meal)
            viewModel.setMeal("Arroz")
            viewModel.save()
            viewModel.saved()

            viewModel.setMeal("Arroz com feijão")
            viewModel.save()
            viewModel.saved()

            val keys = posts().map { it.getHeader("Idempotency-Key") }
            assertNotEquals(keys[0], keys[1])
        }

    @Test
    fun `a failed create keeps the typed text and says which kind failed`() =
        runTest {
            backend.route("POST", "/api/artifacts", status(500))
            val viewModel = newViewModel()
            viewModel.setBody("Texto que fica")
            viewModel.save()

            val failed = viewModel.saved()
            assertEquals("Não foi possível criar a nota. Tente novamente.", failed.error)
            assertEquals("Texto que fica", failed.body)
            assertNull(failed.savedId)

            viewModel.selectKind(NewDocumentKind.Meal)
            viewModel.setMeal("Arroz")
            viewModel.save()
            assertEquals("Não foi possível criar o alimento. Tente novamente.", viewModel.saved().error)
        }

    @Test
    fun `a second tap while saving does not send a second request`() =
        runTest {
            backend.route("POST", "/api/artifacts", fixture("document-edit-create-response", 201))
            val viewModel = newViewModel()
            viewModel.setBody("Texto")
            viewModel.save()
            viewModel.save()
            viewModel.awaitSaved()
            viewModel.save()
            withContext(Dispatchers.Default) { delay(100) }

            assertEquals(1, posts().size)
        }

    @Test
    fun `tags are trimmed, lower-cased, unique and removable, and a half-typed tag goes with the save`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.setTagText("  Casa ")
            viewModel.commitTag()
            viewModel.setTagText("casa")
            viewModel.commitTag()
            viewModel.setTagText("   ")
            viewModel.commitTag()
            viewModel.setTagText("Trabalho")
            viewModel.commitTag()
            assertEquals(listOf("casa", "trabalho"), viewModel.form().tags)

            viewModel.removeTag("casa")
            viewModel.setTagText("Ideias")
            viewModel.setBody("Texto")
            backend.route("POST", "/api/artifacts", fixture("document-edit-create-response", 201))
            viewModel.save()
            viewModel.awaitSaved()

            assertEquals(listOf("trabalho", "ideias"), viewModel.form().tags)
            assertEquals("", viewModel.form().tagText)
        }

    // Edição

    @Test
    fun `editing loads the own text document into the form`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))

            val form = newViewModel("doc-text").settled() as DocumentEditUiState.Form

            assertTrue(form.existing)
            assertEquals("Ideias para o projeto", form.name)
            assertEquals(listOf("trabalho", "ideias"), form.tags)
            assertTrue(form.body.startsWith("# Ideias para o projeto"))
        }

    @Test
    fun `only the own text document is edited here`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-food", fixture("documents-detail-food"))
            backend.route("GET", "/api/artifacts/g", fixture("documents-detail-text-global"))
            backend.route("GET", "/api/artifacts/broken", status(500))

            assertEquals(DocumentEditUiState.NotEditable, newViewModel("doc-food").settled())
            assertEquals(DocumentEditUiState.NotEditable, newViewModel("g").settled())
            assertEquals(DocumentEditUiState.Failed, newViewModel("broken").settled())
        }

    @Test
    fun `retrying after a failed load reads again`() =
        runTest {
            var broken = true
            backend.route("GET", "/api/artifacts/doc-text") { if (broken) status(500) else fixture("documents-detail-text") }
            val viewModel = newViewModel("doc-text")
            assertEquals(DocumentEditUiState.Failed, viewModel.settled())

            broken = false
            viewModel.retry()

            assertTrue(viewModel.state.first { it is DocumentEditUiState.Form } is DocumentEditUiState.Form)
        }

    @Test
    fun `saving an edit patches the whole content with the revision that was read`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            backend.route("PATCH", "/api/artifacts/doc-text", MockResponse().setResponseCode(204))
            val viewModel = newViewModel("doc-text")
            viewModel.settled()
            viewModel.setName("Ideias revisadas")
            viewModel.setBody("# Ideias\n\nTexto novo")
            viewModel.save()

            assertEquals("doc-text", viewModel.awaitSaved())
            assertEquals(Fixtures.json("document-edit-update-request"), body(patches().single()))
            assertTrue(posts().isEmpty())
        }

    @Test
    fun `saving an edit of news, an email summary or a transcript keeps the type of the document`() =
        runTest {
            listOf(
                Triple("doc-news", "documents-detail-news", "news"),
                Triple("doc-email", "documents-detail-email-summary", "email_summary"),
                Triple("doc-youtube", "documents-detail-youtube-transcript", "youtube_transcript"),
            ).forEach { (id, detail, code) ->
                backend.route("GET", "/api/artifacts/$id", fixture(detail))
                backend.route("PATCH", "/api/artifacts/$id", MockResponse().setResponseCode(204))
                val viewModel = newViewModel(id)
                viewModel.settled()
                viewModel.setBody("Texto corrigido")
                viewModel.save()

                assertEquals(id, viewModel.awaitSaved())
                val sent = body(backend.requestsTo("PATCH", "/api/artifacts/$id").single()).jsonObject
                assertEquals(code, sent.getValue("type").jsonPrimitive.content)
                assertEquals(
                    "Texto corrigido",
                    sent
                        .getValue("data")
                        .jsonObject
                        .getValue("body")
                        .jsonPrimitive.content,
                )
            }
        }

    @Test
    fun `the editor loads name, tags and body of news, an email summary and a transcript`() =
        runTest {
            listOf(
                Triple("doc-news", "documents-detail-news", Triple("Notícias da manhã", listOf("leitura"), "# Notícias da manhã")),
                Triple(
                    "doc-email",
                    "documents-detail-email-summary",
                    Triple("Resumo da caixa de entrada", emptyList<String>(), "Três mensagens"),
                ),
                Triple(
                    "doc-youtube",
                    "documents-detail-youtube-transcript",
                    Triple("Aula de jardinagem", emptyList<String>(), "# Aula de jardinagem"),
                ),
            ).forEach { (id, detail, expected) ->
                backend.route("GET", "/api/artifacts/$id", fixture(detail))

                val form = newViewModel(id).settled() as DocumentEditUiState.Form

                assertTrue(form.existing)
                assertEquals(expected.first, form.name)
                assertEquals(expected.second, form.tags)
                assertTrue(form.body.startsWith(expected.third))
            }
        }

    @Test
    fun `a global document of a new type and a type this app does not know are not edited here`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-news-global", fixture("documents-detail-news-global"))
            backend.route("GET", "/api/artifacts/doc-future", fixture("documents-detail-unknown"))
            backend.route("GET", "/api/artifacts/doc-future-bare", fixture("documents-detail-unknown-no-body"))

            assertEquals(DocumentEditUiState.NotEditable, newViewModel("doc-news-global").settled())
            assertEquals(DocumentEditUiState.NotEditable, newViewModel("doc-future").settled())
            assertEquals(DocumentEditUiState.NotEditable, newViewModel("doc-future-bare").settled())
        }

    @Test
    fun `a stale revision on news re-reads it, warns, and the retry sends the own type and the new revision`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-news", fixture("documents-detail-news"), fixture("document-edit-reread-news"))
            backend.route("PATCH", "/api/artifacts/doc-news", status(409), MockResponse().setResponseCode(204))
            val viewModel = newViewModel("doc-news")
            viewModel.settled()
            viewModel.setBody("Texto corrigido")
            viewModel.save()

            val stale = viewModel.saved()
            assertEquals(STALE_TEXT_MESSAGE, stale.error)
            assertEquals("Texto corrigido", stale.body)
            assertEquals(2, backend.requestsTo("GET", "/api/artifacts/doc-news").size)

            viewModel.save()
            assertEquals("doc-news", viewModel.awaitSaved())

            val patches = backend.requestsTo("PATCH", "/api/artifacts/doc-news")
            assertEquals(Fixtures.json("document-edit-update-news-after-stale-request"), body(patches[1]))
            assertEquals(
                "news",
                body(patches[0])
                    .jsonObject
                    .getValue("type")
                    .jsonPrimitive.content,
            )
        }

    @Test
    fun `the app offers to create only a text document or a food, with no way to make one of the new types`() {
        assertEquals(listOf(NewDocumentKind.Text, NewDocumentKind.Meal), NewDocumentKind.entries)
        assertEquals(
            listOf("tarefa", "nota", "buscar", "notificacoes", "configuracoes"),
            ChatCommand.entries.map { it.slug },
        )
    }

    @Test
    fun `an edit that clears the name omits it`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            backend.route("PATCH", "/api/artifacts/doc-text", MockResponse().setResponseCode(204))
            val viewModel = newViewModel("doc-text")
            viewModel.settled()
            viewModel.setName("  ")
            viewModel.setBody("Sem nome")
            viewModel.save()
            viewModel.awaitSaved()

            assertEquals(Fixtures.json("document-edit-update-unnamed-request"), body(patches().single()))
        }

    @Test
    fun `a stale revision re-reads the revision, keeps the typed text and saves again with the new one`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"), fixture("document-edit-reread"))
            backend.route("PATCH", "/api/artifacts/doc-text", status(409), MockResponse().setResponseCode(204))
            val viewModel = newViewModel("doc-text")
            viewModel.settled()
            viewModel.setName("Ideias revisadas")
            viewModel.setBody("# Ideias\n\nTexto novo")
            viewModel.save()

            val stale = viewModel.saved()
            assertEquals(
                "Esta nota mudou em outro lugar. Atualizamos a revisão; o que você digitou continua aqui. Confira e salve de novo.",
                stale.error,
            )
            assertEquals("# Ideias\n\nTexto novo", stale.body)
            assertEquals("Ideias revisadas", stale.name)
            assertEquals(2, backend.requestsTo("GET", "/api/artifacts/doc-text").size)

            viewModel.save()
            viewModel.awaitSaved()

            assertEquals(Fixtures.json("document-edit-update-after-stale-request"), body(patches()[1]))
        }

    @Test
    fun `a failed edit says so and keeps the form`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            backend.route("PATCH", "/api/artifacts/doc-text", status(500))
            val viewModel = newViewModel("doc-text")
            viewModel.settled()
            viewModel.setBody("Texto novo")
            viewModel.save()

            val failed = viewModel.saved()
            assertEquals("Não foi possível salvar a nota. Tente novamente.", failed.error)
            assertEquals("Texto novo", failed.body)
            assertNull(failed.savedId)
        }

    // Tarefas ligadas

    @Test
    fun `editing lists the person tasks linked to the document, with the saved relation`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))

            val form = newViewModel("doc-text").settled() as DocumentEditUiState.Form

            assertEquals(listOf("task-1", "task-3"), form.tasks.map { it.taskId })
            assertEquals(listOf("creates", "uses"), form.tasks.map { it.relation })
            assertEquals("Reunião de planejamento", form.tasks.first().name)
            assertEquals(TaskKind.Common, form.tasks.first().kind)
        }

    @Test
    fun `the task sheet offers person tasks from the list and then from the agenda around today, without repeats or linked ones`() =
        runTest {
            routeHumanTasks()
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            val viewModel = newViewModel("doc-text")
            viewModel.settled()

            viewModel.openTaskPicker()

            assertEquals(listOf("task-9", "task-10", "task-11"), viewModel.pickerReady())
            val tracked = backend.requestsTo("GET", "/api/tasks/tracked").single().requestUrl!!
            assertEquals("human", tracked.queryParameter("actor"))
            assertEquals("50", tracked.queryParameter("limit"))
            assertNull(tracked.queryParameter("q"))
            val agenda = backend.requestsTo("GET", "/api/tasks").single().requestUrl!!
            assertEquals("human", agenda.queryParameter("actor"))
            assertEquals("2026-08-31T03:00:00.000Z", agenda.queryParameter("from"))
            assertEquals("2026-09-29T02:59:59.999Z", agenda.queryParameter("to"))
        }

    @Test
    fun `searching the task sheet filters the agenda by name, ignoring accents, and reuses the agenda already read`() =
        runTest {
            routeHumanTasks()
            val viewModel = newViewModel()
            viewModel.openTaskPicker()
            viewModel.pickerReady()

            viewModel.typeTaskSearch("almoco")

            assertEquals(listOf("task-10"), viewModel.pickerReady("almoco"))
            assertEquals(
                "almoco",
                backend
                    .requestsTo("GET", "/api/tasks/tracked")
                    .last()
                    .requestUrl
                    ?.queryParameter("q"),
            )
            assertEquals(1, backend.requestsTo("GET", "/api/tasks").size)
        }

    @Test
    fun `a failed agenda still answers with the task list, and a failed list says the search failed`() =
        runTest {
            backend.route("GET", "/api/tasks/tracked", fixture("document-edit-human-tracked"), status(500))
            backend.route("GET", "/api/tasks", status(500))
            val viewModel = newViewModel()

            viewModel.openTaskPicker()
            assertEquals(listOf("task-1", "task-9"), viewModel.pickerReady())

            viewModel.typeTaskSearch("x")
            val failed =
                viewModel.state.first {
                    (it as? DocumentEditUiState.Form)?.taskPicker?.status == PickerSearchStatus.Failed
                } as DocumentEditUiState.Form
            assertEquals("x", failed.taskPicker?.query)
        }

    @Test
    fun `a new text document goes with the tasks picked in the sheet`() =
        runTest {
            routeHumanTasks()
            backend.route("POST", "/api/artifacts", fixture("document-edit-create-response", 201))
            val viewModel = newViewModel()
            viewModel.setBody("Lista de presentes")
            viewModel.openTaskPicker()
            viewModel.pickerReady()
            val choices = viewModel.form().taskPicker!!.results

            viewModel.pickTask(choices.first { it.id == "task-9" })
            assertNull(viewModel.form().taskPicker)
            viewModel.openTaskPicker()
            assertEquals(listOf("task-1", "task-10", "task-11"), viewModel.pickerReady())
            viewModel.pickTask(
                viewModel
                    .form()
                    .taskPicker!!
                    .results
                    .first { it.id == "task-10" },
            )
            viewModel.save()

            assertEquals("doc-new", viewModel.awaitSaved())
            assertEquals(Fixtures.json("document-edit-create-note-with-tasks-request"), body(posts().single()))
        }

    @Test
    fun `a new food goes with its tasks too`() =
        runTest {
            routeHumanTasks()
            backend.route("POST", "/api/artifacts", fixture("document-edit-create-response", 201))
            val viewModel = newViewModel()
            viewModel.selectKind(NewDocumentKind.Meal)
            viewModel.setMeal("Arroz e feijão")
            viewModel.openTaskPicker()
            viewModel.pickerReady()
            viewModel.pickTask(
                viewModel
                    .form()
                    .taskPicker!!
                    .results
                    .first { it.id == "task-10" },
            )
            viewModel.save()
            viewModel.awaitSaved()

            assertEquals(Fixtures.json("document-edit-create-food-with-tasks-request"), body(posts().single()))
        }

    @Test
    fun `unlinking and linking tasks in an edit sends the new list, and closing the sheet links nothing`() =
        runTest {
            routeHumanTasks()
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            backend.route("PATCH", "/api/artifacts/doc-text", MockResponse().setResponseCode(204))
            val viewModel = newViewModel("doc-text")
            viewModel.settled()

            viewModel.openTaskPicker()
            viewModel.pickerReady()
            viewModel.closeTaskPicker()
            assertNull(viewModel.form().taskPicker)
            viewModel.unlinkTask("task-3")
            viewModel.openTaskPicker()
            viewModel.pickerReady()
            viewModel.pickTask(
                viewModel
                    .form()
                    .taskPicker!!
                    .results
                    .first { it.id == "task-10" },
            )
            viewModel.save()
            viewModel.awaitSaved()

            val sent = body(patches().single()).jsonObject
            assertEquals(JsonArray(listOf(JsonPrimitive("task-1"), JsonPrimitive("task-10"))), sent["taskIds"])
            assertEquals(1, sent["expectedRevision"]?.jsonPrimitive?.content?.toInt())
        }

    @Test
    fun `unlinking every task sends an empty list`() =
        runTest {
            routeHumanTasks()
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))
            backend.route("PATCH", "/api/artifacts/doc-text", MockResponse().setResponseCode(204))
            val viewModel = newViewModel("doc-text")
            viewModel.settled()

            viewModel.unlinkTask("task-1")
            viewModel.unlinkTask("task-3")
            assertTrue(viewModel.form().tasks.isEmpty())
            viewModel.save()
            viewModel.awaitSaved()

            assertEquals(JsonArray(emptyList()), body(patches().single()).jsonObject["taskIds"])
        }

    // Sugestões de tags e tipo

    @Test
    fun `tag suggestions come from the API after typing, keeping names that start with the text, and picking one adds it`() =
        runTest {
            backend.route("GET", "/api/tags", fixture("task-edit-tag-suggestions"))
            val viewModel = newViewModel()

            viewModel.setTagText("t")
            viewModel.setTagText("  Trab")
            val form = viewModel.state.first { (it as DocumentEditUiState.Form).tagSuggestions.isNotEmpty() } as DocumentEditUiState.Form

            assertEquals(listOf("trabalho", "trabalho-novo"), form.tagSuggestions)
            val request = backend.requestsTo("GET", "/api/tags").single()
            assertEquals("trab", request.requestUrl?.queryParameter("query"))
            assertEquals("6", request.requestUrl?.queryParameter("limit"))

            viewModel.pickTagSuggestion("trabalho-novo")
            assertEquals(listOf("trabalho-novo"), viewModel.form().tags)
            assertEquals("", viewModel.form().tagText)
            assertTrue(viewModel.form().tagSuggestions.isEmpty())
        }

    @Test
    fun `the summary shows the type code of the choice when creating and of the document when editing`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-news", fixture("documents-detail-news"))
            val creating = newViewModel()
            assertEquals(ArtifactType.Text to "text", creating.form().shownType to creating.form().shownTypeCode)
            creating.selectKind(NewDocumentKind.Meal)
            assertEquals(ArtifactType.Food to "food", creating.form().shownType to creating.form().shownTypeCode)

            val editing = newViewModel("doc-news").settled() as DocumentEditUiState.Form
            assertEquals(ArtifactType.News to "news", editing.shownType to editing.shownTypeCode)
        }
}
