package app.braid.mobile.ui.shell

import app.braid.mobile.data.tasks.DefaultTaskRepository
import app.braid.mobile.data.tasks.TasksApi
import app.braid.mobile.domain.execution.ExecutionDrawerMode
import app.braid.mobile.domain.request.RequestStarted
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import app.braid.mobile.support.TestViewModes
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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** A gaveta de execução pela rede: o que ela lê, quando relê, e a altura guardada que vale nas três abas. */
@OptIn(ExperimentalCoroutinesApi::class)
class ExecutionDrawerViewModelTest {
    private val listPath = "/api/tasks/tracked"

    @get:Rule
    val folder = TemporaryFolder()

    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph
    private lateinit var viewModes: TestViewModes
    private val started = RequestStarted()
    private val created = mutableListOf<ExecutionDrawerViewModel>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
        viewModes = TestViewModes(folder.root.resolve("settings.preferences_pb"))
    }

    @After
    fun tearDown() {
        created.forEach { it.stopAndJoin() }
        viewModes.close()
        backend.close()
        Dispatchers.resetMain()
    }

    private fun newViewModel(): ExecutionDrawerViewModel =
        ExecutionDrawerViewModel(
            DefaultTaskRepository(graph.apis.create(TasksApi::class.java)),
            viewModes.executionDrawer,
            started,
        ).also(created::add)

    private fun reads(): Int = backend.requestsTo("GET", listPath).size

    private suspend fun awaitReads(count: Int) =
        withContext(Dispatchers.Default) {
            withTimeout(5_000) { while (reads() < count) delay(5) }
        }

    private fun ExecutionDrawerViewModel.show() {
        setForeground(true)
        setActive(true)
    }

    private suspend fun ExecutionDrawerViewModel.ids(): List<String> {
        awaitReads(1)
        return state.first { it.ready && it.runs.isNotEmpty() }.runs.map { it.id }
    }

    @Test
    fun `without runs in progress the drawer has nothing to show`() =
        runTest {
            backend.route("GET", listPath, fixture("execution-list-empty"))
            val viewModel = newViewModel()
            viewModel.show()
            awaitReads(1)
            withContext(Dispatchers.Default) { delay(100) }

            assertTrue(
                viewModel.state.value.runs
                    .isEmpty(),
            )
        }

    @Test
    fun `it asks for the agent runs in progress and keeps no step, schedule or finished run`() =
        runTest {
            backend.route("GET", listPath, fixture("execution-list-mixed"))
            val viewModel = newViewModel()
            viewModel.show()

            assertEquals(listOf("run-newest", "run-preparing", "run-mid", "run-old", "run-nostart"), viewModel.ids())
            val url = backend.requestsTo("GET", listPath).first().requestUrl!!
            assertEquals("agent", url.queryParameter("actor"))
            assertEquals(setOf("preparing", "queued", "starting", "running"), url.queryParameter("status")!!.split(",").toSet())
        }

    @Test
    fun `it reads nothing until the drawer is on a screen with the bar and the app is in front`() =
        runTest {
            backend.route("GET", listPath, fixture("execution-list-single"))
            val viewModel = newViewModel()

            viewModel.setForeground(true)
            advanceTimeBy(120_000)
            runCurrent()
            assertEquals("no tab, no read", 0, reads())

            viewModel.setActive(true)
            awaitReads(1)
            assertEquals(listOf("run-only"), viewModel.ids())

            viewModel.setForeground(false)
            val before = reads()
            advanceTimeBy(120_000)
            runCurrent()
            assertEquals("in the background, no read", before, reads())
        }

    @Test
    fun `with a run it re-reads every 3 seconds`() =
        runTest {
            backend.route("GET", listPath, fixture("execution-list-single"))
            val viewModel = newViewModel()
            viewModel.show()
            viewModel.ids()
            val before = reads()

            advanceTimeBy(2_999)
            runCurrent()
            assertEquals(before, reads())
            advanceTimeBy(1)
            runCurrent()
            awaitReads(before + 1)
        }

    @Test
    fun `a run that finishes leaves the drawer on the next read and the reading slows to 30 seconds`() =
        runTest {
            var finished = false
            backend.route("GET", listPath) { if (finished) fixture("execution-list-empty") else fixture("execution-list-single") }
            val viewModel = newViewModel()
            viewModel.show()
            viewModel.ids()
            finished = true

            advanceTimeBy(3_000)
            runCurrent()
            viewModel.state.first { it.runs.isEmpty() }
            val settled = reads()

            advanceTimeBy(29_999)
            runCurrent()
            assertEquals("idle waits 30 s", settled, reads())
            advanceTimeBy(1)
            runCurrent()
            awaitReads(settled + 1)
        }

    @Test
    fun `with no run, coming back to the app, opening a request and the 30 second beat all read`() =
        runTest {
            backend.route("GET", listPath, fixture("execution-list-empty"))
            val viewModel = newViewModel()
            viewModel.show()
            awaitReads(1)

            viewModel.setForeground(false)
            viewModel.setForeground(true)
            awaitReads(2)

            started.notifyStarted()
            awaitReads(3)

            advanceTimeBy(30_000)
            runCurrent()
            awaitReads(4)
        }

    @Test
    fun `a request the app opens while the drawer is out of the screen does not read`() =
        runTest {
            backend.route("GET", listPath, fixture("execution-list-empty"))
            val viewModel = newViewModel()
            viewModel.setForeground(true)
            started.notifyStarted()
            runCurrent()
            withContext(Dispatchers.Default) { delay(100) }

            assertEquals(0, reads())
            assertFalse(
                viewModel.state.value.runs
                    .isNotEmpty(),
            )
        }

    @Test
    fun `a read that fails keeps the runs on show`() =
        runTest {
            var broken = false
            backend.route("GET", listPath) { if (broken) status(503) else fixture("execution-list-single") }
            val viewModel = newViewModel()
            viewModel.show()
            viewModel.ids()
            val before = reads()
            broken = true

            advanceTimeBy(3_000)
            runCurrent()
            awaitReads(before + 1)
            withContext(Dispatchers.Default) { delay(100) }

            assertEquals(
                listOf("run-only"),
                viewModel.state.value.runs
                    .map { it.id },
            )
        }

    @Test
    fun `the height starts at three rows and each change is saved`() =
        runTest {
            backend.route("GET", listPath, fixture("execution-list-empty"))
            val viewModel = newViewModel()
            assertEquals(ExecutionDrawerMode.Three, viewModel.state.first { it.ready }.mode)

            viewModel.setMode(ExecutionDrawerMode.All)
            assertEquals(ExecutionDrawerMode.All, viewModel.state.value.mode)
            assertTrue("three to all grows", viewModel.state.value.grow)
            viewModel.setMode(ExecutionDrawerMode.One)
            assertFalse("all to one shrinks", viewModel.state.value.grow)
            withContext(Dispatchers.Default) {
                withTimeout(5_000) {
                    while (viewModes.executionDrawer.mode.first() !=
                        ExecutionDrawerMode.One
                    ) {
                        delay(5)
                    }
                }
            }
        }

    @Test
    fun `the height survives closing and opening the app and holds across the three tabs`() =
        runTest {
            backend.route("GET", listPath, fixture("execution-list-single"))
            val first = newViewModel()
            first.state.first { it.ready }
            first.setMode(ExecutionDrawerMode.All)
            withContext(Dispatchers.Default) {
                withTimeout(5_000) {
                    while (viewModes.executionDrawer.mode.first() !=
                        ExecutionDrawerMode.All
                    ) {
                        delay(5)
                    }
                }
            }

            // Trocar de aba é só a tela atual mudar: o mesmo ViewModel segue com a mesma altura.
            first.show()
            first.ids()
            first.setActive(false)
            first.setActive(true)
            assertEquals(ExecutionDrawerMode.All, first.state.value.mode)

            // Fechar e abrir o app: outro ViewModel, o mesmo arquivo.
            val reopened = newViewModel()
            assertEquals(ExecutionDrawerMode.All, reopened.state.first { it.ready }.mode)
        }
}
