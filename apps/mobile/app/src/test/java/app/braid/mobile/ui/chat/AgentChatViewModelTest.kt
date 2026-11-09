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
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AgentChatViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun processShowsTheBoxStepByStepAndRefreshesTheAgendaOnce() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway()
            val viewModel = viewModel(processes)
            runCurrent()

            viewModel.effects.test {
                viewModel.send("comendo arroz, depois vou nadar")
                runCurrent()

                assertEquals(
                    AgentChatMessageRole.Process,
                    viewModel.state.value.messages
                        .last()
                        .role,
                )
                assertEquals(
                    "Realizando processos",
                    viewModel.state.value.pending
                        ?.label,
                )
                val (text, context) = processes.started.single()
                assertEquals("comendo arroz, depois vou nadar", text)
                assertEquals("agenda", context?.screen)

                processes.views.clear()
                processes.views.add(process("running", "succeeded", "running"))
                advanceTimeBy(10)
                runCurrent()
                assertEquals(
                    listOf("succeeded", "running"),
                    viewModel.state.value.messages
                        .last()
                        .process
                        ?.steps
                        ?.map { it.status },
                )
                expectNoEvents()

                processes.views.clear()
                processes.views.add(process("completed", "succeeded", "succeeded", entities = 1))
                advanceTimeBy(10)
                runCurrent()
                assertNull(viewModel.state.value.pending)
                assertEquals(AgentChatUiEffect.EntitiesChanged, awaitItem())
                expectNoEvents()
            }
        }

    @Test
    fun failedStepsStayInTheBoxAndNothingElseIsAnError() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway()
            val viewModel = viewModel(processes)
            runCurrent()
            processes.views.add(process("completed", "succeeded", "failed", message = "Criei o evento, mas não consegui criar a nota."))

            viewModel.send("almocei e anota")
            runCurrent()

            assertEquals(
                "Criei o evento, mas não consegui criar a nota.",
                viewModel.state.value.messages
                    .last()
                    .process
                    ?.message,
            )
            assertEquals(
                listOf(AgentChatMessageRole.User, AgentChatMessageRole.Process),
                viewModel.state.value.messages
                    .map { it.role },
            )
            assertNull(viewModel.state.value.pending)
        }

    @Test
    fun startFailureBecomesAnErrorAndRetryResendsTheText() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway().apply { startFailure = ProcessStart.Failed(500) }
            val viewModel = viewModel(processes)
            runCurrent()

            viewModel.send("oi")
            runCurrent()

            val error =
                viewModel.state.value.messages
                    .last()
            assertEquals(AgentChatMessageRole.Error, error.role)
            assertEquals("oi", error.retryText)
            assertEquals("Não consegui conectar ao assistente. Tente de novo.", error.text)
            assertNull(viewModel.state.value.pending)

            // Um 404 também é só falha: não há mais outro caminho para onde cair.
            processes.startFailure = null
            processes.views.add(process("completed", "succeeded"))
            viewModel.retry(error.id)
            runCurrent()

            assertEquals(listOf("oi", "oi"), processes.started.map { it.first })
            assertEquals(
                listOf(AgentChatMessageRole.User, AgentChatMessageRole.Process),
                viewModel.state.value.messages
                    .map { it.role },
            )
        }

    @Test
    fun expiredSessionAtStartAsksToSignInAgain() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway().apply { startFailure = ProcessStart.Failed(401) }
            val viewModel = viewModel(processes)
            runCurrent()

            viewModel.send("oi")
            runCurrent()

            assertEquals(
                "Sua sessão acabou. Entre de novo para continuar.",
                viewModel.state.value.messages
                    .last()
                    .text,
            )
        }

    @Test
    fun repeatedPollFailuresBecomeConnectionLost() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway().apply { pollFailure = ProcessPoll.Failed(500) }
            val viewModel = viewModel(processes)
            runCurrent()

            viewModel.send("oi")
            advanceTimeBy(100)
            runCurrent()

            assertEquals(5, processes.polls)
            assertEquals(
                AgentChatMessageRole.Error,
                viewModel.state.value.messages
                    .last()
                    .role,
            )
            assertNull(viewModel.state.value.pending)
        }

    @Test
    fun startNewConversationClearsTheScreenOnlyWhenNothingIsRunning() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway().apply { views.add(process("running", "running", "pending")) }
            val viewModel = viewModel(processes)
            runCurrent()
            viewModel.send("oi")
            runCurrent()

            viewModel.startNewConversation()
            assertEquals(2, viewModel.state.value.messages.size)

            processes.views.clear()
            processes.views.add(process("completed", "succeeded"))
            advanceTimeBy(10)
            runCurrent()
            viewModel.startNewConversation()
            assertEquals(emptyList<AgentChatUiMessage>(), viewModel.state.value.messages)
        }

    private fun viewModel(processes: ProcessGateway): AgentChatViewModel = AgentChatViewModel(processes).apply { processPollMillis = 10 }

    private fun process(
        status: String,
        vararg states: String,
        entities: Int = 0,
        message: String? = null,
    ) = AiProcessDto(
        id = "process-1",
        status = status,
        title = "Realizando processos:",
        steps = states.mapIndexed { index, state -> AiProcessStepDto("s$index", "event-create", "Passo $index", state) },
        entities = List(entities) { AiProcessEntityDto("event", "e$it", "Evento", "create") },
        message = message,
    )
}

/** O que o servidor respondeu ao iniciar e a fila de estados que ele devolve a cada consulta. */
private class FakeProcessGateway : ProcessGateway {
    var startFailure: ProcessStart.Failed? = null
    var pollFailure: ProcessPoll.Failed? = null
    val started = mutableListOf<Pair<String, AgentScreenContextDto?>>()
    val views = mutableListOf<AiProcessDto>()
    var polls = 0

    override suspend fun start(
        text: String,
        context: AgentScreenContextDto?,
    ): ProcessStart {
        started += text to context
        return startFailure ?: ProcessStart.Started("process-1")
    }

    override suspend fun get(processId: String): ProcessPoll {
        polls += 1
        pollFailure?.let { return it }
        // O último estado conhecido se repete até o teste empurrar o próximo.
        val view = if (views.size > 1) views.removeAt(0) else views.firstOrNull()
        return view?.let { ProcessPoll.View(it) } ?: ProcessPoll.Failed()
    }
}
