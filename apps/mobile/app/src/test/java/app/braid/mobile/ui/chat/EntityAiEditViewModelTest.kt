package app.braid.mobile.ui.chat

import app.braid.mobile.data.chat.ProcessGateway
import app.braid.mobile.data.chat.ProcessPoll
import app.braid.mobile.data.chat.ProcessStart
import app.braid.mobile.data.dto.AgentScreenContextDto
import app.braid.mobile.data.dto.AiProcessDto
import app.braid.mobile.data.dto.AiProcessEntityDto
import app.braid.mobile.data.dto.AiProcessStepDto
import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class EntityAiEditViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun sendsTheEntityTypeAndIdAndTellsTheScreenOnceWhenTheEditLands() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeEditGateway().apply { views += process("running", "running") }
            val viewModel = viewModel(gateway)

            viewModel.effects.test {
                assertTrue(viewModel.submit("  dormi 8h  ", "sleep_note", "n1"))
                assertEquals(EntityAiEditPhase.Sending, viewModel.state.value.phase)
                runCurrent()
                assertEquals(Triple("dormi 8h", "sleep_note", "n1"), gateway.started.single())

                advanceTimeBy(10)
                runCurrent()
                assertEquals(EntityAiEditPhase.Running, viewModel.state.value.phase)
                assertTrue(viewModel.state.value.busy)

                gateway.views.clear()
                gateway.views += process("completed", "succeeded", entities = 1)
                advanceTimeBy(10)
                runCurrent()

                assertEquals(EntityAiEditPhase.Done, viewModel.state.value.phase)
                assertEquals(EntityAiEditEffect.Edited, awaitItem())
                expectNoEvents()
            }
        }

    @Test
    fun aFailedProcessShowsTheServerMessageAndDoesNotReload() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway =
                FakeEditGateway().apply {
                    views +=
                        process("failed", "failed", message = "Não consegui concluir: editando eventos.")
                }
            val viewModel = viewModel(gateway)

            viewModel.effects.test {
                viewModel.submit("faz algo", "event", "e1")
                runCurrent()
                advanceTimeBy(10)
                runCurrent()

                assertEquals(EntityAiEditPhase.Failed, viewModel.state.value.phase)
                assertEquals("Não consegui concluir: editando eventos.", viewModel.state.value.error)
                expectNoEvents()
            }
        }

    @Test
    fun startFailuresBecomePredefinedTexts() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeEditGateway()
            val viewModel = viewModel(gateway)
            val expected =
                mapOf(
                    401 to EntityAiEditViewModel.SESSION_EXPIRED,
                    403 to EntityAiEditViewModel.FORBIDDEN,
                    400 to EntityAiEditViewModel.INVALID,
                    404 to EntityAiEditViewModel.UNAVAILABLE,
                    500 to EntityAiEditViewModel.GENERIC,
                )
            expected.forEach { (status, text) ->
                gateway.startFailure = ProcessStart.Failed(status)
                assertTrue(viewModel.submit("pedido", "note", "n1"))
                runCurrent()
                assertEquals(EntityAiEditPhase.Failed, viewModel.state.value.phase)
                assertEquals(text, viewModel.state.value.error)
                viewModel.dismiss()
            }
        }

    @Test
    fun fiveFailedPollsEndTheRequest() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeEditGateway().apply { pollFailure = ProcessPoll.Failed(500) }
            val viewModel = viewModel(gateway)
            viewModel.submit("pedido", "note", "n1")
            runCurrent()
            advanceTimeBy(100)
            runCurrent()

            assertEquals(5, gateway.polls)
            assertEquals(EntityAiEditPhase.Failed, viewModel.state.value.phase)
            assertEquals(EntityAiEditViewModel.CONNECTION_LOST, viewModel.state.value.error)
        }

    @Test
    fun emptyTextAndASecondRequestAreRefusedWhileOneRuns() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeEditGateway().apply { views += process("running", "running") }
            val viewModel = viewModel(gateway)

            assertFalse(viewModel.submit("   ", "note", "n1"))
            assertTrue(viewModel.submit("um", "note", "n1"))
            assertFalse(viewModel.submit("dois", "note", "n1"))
            runCurrent()
            assertEquals(1, gateway.started.size)

            viewModel.dismiss()
            assertTrue(viewModel.state.value.busy)
            assertNull(viewModel.state.value.error)
        }

    @Test
    fun theTargetLabelsAndNoteTypesMatchTheWeb() {
        assertEquals("este evento", editTargetLabel("event"))
        assertEquals("esta refeição", editTargetLabel("meal_note"))
        assertEquals("esta skill", editTargetLabel("skill_note"))
        assertEquals("esta nota", editTargetLabel("note"))
        assertEquals("note", editEntityTypeOfNote("text"))
        assertEquals("meal_note", editEntityTypeOfNote("meal"))
        assertEquals("training_note", editEntityTypeOfNote("training"))
        assertEquals("agent_note", editEntityTypeOfNote("agent"))
        assertNull(editEntityTypeOfNote("router"))
    }

    private fun viewModel(gateway: ProcessGateway) = EntityAiEditViewModel(gateway).apply { pollMillis = 10 }

    private fun process(
        status: String,
        vararg states: String,
        entities: Int = 0,
        message: String? = null,
    ) = AiProcessDto(
        id = "process-1",
        status = status,
        title = "Realizando processos:",
        steps = states.mapIndexed { index, state -> AiProcessStepDto("s$index", "sleep-note-edit", "Passo $index", state) },
        entities = List(entities) { AiProcessEntityDto("note", "n$it", "Sono", "update") },
        message = message,
    )
}

private class FakeEditGateway : ProcessGateway {
    var startFailure: ProcessStart.Failed? = null
    var pollFailure: ProcessPoll.Failed? = null
    val started = mutableListOf<Triple<String, String, String>>()
    val views = mutableListOf<AiProcessDto>()
    var polls = 0

    override suspend fun start(
        text: String,
        context: AgentScreenContextDto?,
    ): ProcessStart = error("a edição não usa o chat")

    override suspend fun startEdit(
        text: String,
        entityType: String,
        entityId: String,
    ): ProcessStart {
        started += Triple(text, entityType, entityId)
        return startFailure ?: ProcessStart.Started("process-1")
    }

    override suspend fun get(processId: String): ProcessPoll {
        polls += 1
        pollFailure?.let { return it }
        val view = if (views.size > 1) views.removeAt(0) else views.firstOrNull()
        return view?.let { ProcessPoll.View(it) } ?: ProcessPoll.Failed()
    }
}
