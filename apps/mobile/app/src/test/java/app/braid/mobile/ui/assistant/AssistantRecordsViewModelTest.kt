package app.braid.mobile.ui.assistant

import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.domain.assistant.recordWhenLabel
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
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
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** As tarefas que a resposta do assistente gravou, lidas pela rede para o cartão do painel. */
@OptIn(ExperimentalCoroutinesApi::class)
class AssistantRecordsViewModelTest {
    private val taskPath = "/api/tasks/task-1"

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private val created = mutableListOf<AssistantRecordsViewModel>()

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

    private fun newViewModel() =
        AssistantRecordsViewModel(DefaultTaskDetailRepository(graph.apis.create(TaskDetailApi::class.java))).also(created::add)

    private fun entity(
        id: String = "task-1",
        kind: EntityKind = EntityKind.Task,
        operation: RequestOperation = RequestOperation.Create,
    ) = RequestEntity(kind = kind, id = id, name = "Reunião de planejamento", artifactType = null, operation = operation)

    /** Espera, em tempo real, a rede receber [count] leituras da tarefa. */
    private suspend fun awaitReads(count: Int) =
        withContext(Dispatchers.Default) {
            withTimeout(10_000) { while (backend.requestsTo("GET", taskPath).size < count) delay(10) }
        }

    @Test
    fun `the task a request created is read, and its card says when it happens`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            val records = newViewModel()

            records.show(listOf(entity()))

            val cards = withContext(Dispatchers.Default) { withTimeout(10_000) { records.cards.first { it.isNotEmpty() } } }
            assertEquals(setOf("task-1"), cards.keys)
            assertEquals("Seg, 14 set · 18:30 — 19:20", recordWhenLabel(cards.getValue("task-1")))
        }

    @Test
    fun `a task that cannot be read leaves no card and the next ones are still read`() =
        runTest {
            backend.route("GET", taskPath, status(404), fixture("task-detail-person"))
            val records = newViewModel()

            records.show(listOf(entity()))
            awaitReads(1)
            withContext(Dispatchers.Default) { delay(100) }
            assertTrue(records.cards.value.isEmpty())

            records.show(listOf(entity(operation = RequestOperation.Update)))
            val cards = withContext(Dispatchers.Default) { withTimeout(10_000) { records.cards.first { it.isNotEmpty() } } }
            assertEquals(setOf("task-1"), cards.keys)
        }

    @Test
    fun `a deleted task and a document are not read`() =
        runTest {
            backend.route("GET", taskPath, fixture("task-detail-person"))
            val records = newViewModel()

            records.show(listOf(entity(operation = RequestOperation.Delete), entity(id = "doc-1", kind = EntityKind.Artifact)))
            withContext(Dispatchers.Default) { delay(100) }

            assertTrue(backend.requestsTo("GET", taskPath).isEmpty())
            assertTrue(backend.requestsTo("GET", "/api/tasks/doc-1").isEmpty())
            assertTrue(records.cards.value.isEmpty())
        }
}
