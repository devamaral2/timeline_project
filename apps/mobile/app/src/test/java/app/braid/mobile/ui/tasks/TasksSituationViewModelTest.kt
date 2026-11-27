package app.braid.mobile.ui.tasks

import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskDrawerKey
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.TestViewModes
import app.braid.mobile.support.stopAndJoin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant
import java.util.concurrent.CountDownLatch

/** A situação da tarefa de agente na lista: a mudança aparece na hora, grava pelo `PUT` e é desfeita se a gravação falha. */
@OptIn(ExperimentalCoroutinesApi::class)
class TasksSituationViewModelTest {
    private val listPath = "/api/tasks/tracked"
    private val putPath = "/api/tasks/sit-review/situation"

    @get:Rule
    val folder = TemporaryFolder()

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private lateinit var viewModes: TestViewModes
    private val created = mutableListOf<TasksViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        viewModes = TestViewModes(folder.root.resolve("settings.preferences_pb"))
        backend.route("GET", listPath, fixture("task-list-situations"))
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        viewModes.close()
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(): TasksViewModel =
        TasksViewModel(
            DefaultTaskRepository(graph.apis.create(TasksApi::class.java)),
            viewModes.repository,
            AppClock { Instant.parse("2026-09-14T15:00:00.000Z") },
        ).also(created::add)

    private suspend fun TasksViewModel.settled(): TasksUiState = state.first { it.cards != null }

    private fun TasksUiState.card(id: String): TaskCard = cards.orEmpty().first { it.id == id }

    /** A gaveta da lista em que a linha está, ou `null` se não está em nenhuma. */
    private fun TasksUiState.drawerOfRow(id: String): TaskDrawerKey? =
        drawers.firstOrNull { drawer -> drawer.cards.any { it.id == id } }?.key

    private fun putBody() =
        Json
            .parseToJsonElement(
                backend
                    .requestsTo("PUT", putPath)
                    .single()
                    .body
                    .clone()
                    .readUtf8(),
            ).jsonObject

    /** Segura a resposta do `PUT` até o teste soltar, para conferir o que a tela mostra enquanto grava. */
    private fun holdPut(response: MockResponse): CountDownLatch {
        val release = CountDownLatch(1)
        backend.route("PUT", putPath) {
            release.await()
            response
        }
        return release
    }

    @Test
    fun `choosing Revisada changes the glyph at once and saves with the PUT`() =
        runTest {
            val release = holdPut(fixture("task-situation-reviewed"))
            val viewModel = newViewModel()
            val before = viewModel.settled()
            assertEquals(TaskSituation.ToReview, before.card("sit-review").situation)
            assertEquals(TaskDrawerKey.Now, before.drawerOfRow("sit-review"))

            viewModel.chooseSituation(before.card("sit-review"), TaskSituation.Reviewed)
            // Revisada leva a linha a Finalizadas na hora, antes de a gravação responder.
            assertEquals(TaskDrawerKey.Ended, viewModel.state.value.drawerOfRow("sit-review"))
            assertEquals(before.toNowCount - 1, viewModel.state.value.toNowCount)

            assertEquals(
                TaskSituation.Reviewed,
                viewModel.state.value
                    .card("sit-review")
                    .situation,
            )
            assertEquals(
                TaskSituation.Reviewed,
                viewModel.state.value.facets!!
                    .first { it.id == "sit-review" }
                    .situation,
            )
            release.countDown()
            viewModel.state.first { !it.savingSituation }
            assertEquals("reviewed", putBody().getValue("situation").jsonPrimitive.content)
            assertEquals(
                TaskSituation.Reviewed,
                viewModel.state.value
                    .card("sit-review")
                    .situation,
            )
            assertNull(viewModel.state.value.notice)
        }

    @Test
    fun `choosing Guardada saves bookmarked`() =
        runTest {
            backend.route("PUT", putPath, fixture("task-situation-bookmarked"))
            val viewModel = newViewModel()
            val before = viewModel.settled()

            viewModel.chooseSituation(before.card("sit-review"), TaskSituation.Bookmarked)
            // Guardada leva a linha a Para depois na hora.
            assertEquals(TaskDrawerKey.Later, viewModel.state.value.drawerOfRow("sit-review"))
            viewModel.state.first { !it.savingSituation }

            assertEquals("bookmarked", putBody().getValue("situation").jsonPrimitive.content)
            assertEquals(
                TaskSituation.Bookmarked,
                viewModel.state.value
                    .card("sit-review")
                    .situation,
            )
        }

    @Test
    fun `with the API failing the change is undone and the user is told`() =
        runTest {
            val release = holdPut(status(500))
            val viewModel = newViewModel()
            val before = viewModel.settled()

            viewModel.chooseSituation(before.card("sit-review"), TaskSituation.Reviewed)
            assertEquals(TaskDrawerKey.Ended, viewModel.state.value.drawerOfRow("sit-review"))
            release.countDown()
            val after = viewModel.state.first { it.notice != null }

            assertEquals(TaskDrawerKey.Now, after.drawerOfRow("sit-review"))
            assertEquals(TaskSituation.ToReview, after.card("sit-review").situation)
            assertEquals(TaskSituation.ToReview, after.facets!!.first { it.id == "sit-review" }.situation)
            assertEquals(FAILED_SITUATION_NOTICE, after.notice)
        }

    @Test
    fun `an agent task that is still in progress is not a row, so no situation can move it`() =
        runTest {
            val viewModel = newViewModel()
            val loaded = viewModel.settled()

            assertTrue(loaded.drawers.flatMap { it.cards }.none { it.id == "sit-running" })
            assertEquals(null, loaded.drawerOfRow("sit-running"))
            assertEquals(TaskDrawerKey.Continuous, loaded.drawerOfRow("sit-cron"))
        }

    @Test
    fun `choosing the situation the card already has saves nothing`() =
        runTest {
            val viewModel = newViewModel()
            val before = viewModel.settled()

            viewModel.chooseSituation(before.card("sit-review"), TaskSituation.ToReview)

            assertEquals(0, backend.requestsTo("PUT", putPath).size)
        }

    @Test
    fun `a card with no situation is never changed`() =
        runTest {
            val viewModel = newViewModel()
            val before = viewModel.settled()

            viewModel.chooseSituation(before.card("sit-waiting"), TaskSituation.Reviewed)
            viewModel.chooseSituation(before.card("sit-person"), TaskSituation.Reviewed)

            assertNull(
                viewModel.state.value
                    .card("sit-waiting")
                    .situation,
            )
            assertEquals(0, backend.requests.count { it.method == "PUT" })
        }
}
