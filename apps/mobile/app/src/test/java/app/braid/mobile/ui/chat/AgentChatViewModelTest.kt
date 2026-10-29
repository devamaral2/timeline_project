package app.braid.mobile.ui.chat

import app.braid.mobile.data.chat.AgentChatEvent
import app.braid.mobile.data.chat.AgentChatGateway
import app.braid.mobile.data.chat.AgentChatHistoryGateway
import app.braid.mobile.data.chat.AgentChatHistoryResult
import app.braid.mobile.data.chat.DisabledProcessGateway
import app.braid.mobile.data.chat.ProcessGateway
import app.braid.mobile.data.chat.ProcessPoll
import app.braid.mobile.data.chat.ProcessStart
import app.braid.mobile.data.dto.AgentChatEntityRefDto
import app.braid.mobile.data.dto.AgentChatMessageFrameDto
import app.braid.mobile.data.dto.AgentChatMessagePageDto
import app.braid.mobile.data.dto.AgentChatReplyFrameDto
import app.braid.mobile.data.dto.AgentChatStatusFrameDto
import app.braid.mobile.data.dto.AgentConversationPageDto
import app.braid.mobile.data.dto.AgentScreenContextDto
import app.braid.mobile.data.dto.AiProcessDto
import app.braid.mobile.data.dto.AiProcessEntityDto
import app.braid.mobile.data.dto.AiProcessStepDto
import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AgentChatViewModelTest {
    @Test
    fun reopenRecoversPendingWithoutSubmittingAgainAndUsesAuthoritativeHistory() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val job =
                app.braid.mobile.data.dto.AiJobDto(
                    "job-1",
                    "agent-turn",
                    "running",
                    "user-1",
                    "2026-09-22T11:00:00Z",
                    "2026-09-22T11:01:00Z",
                    progress = "Consultando",
                    request =
                        app.braid.mobile.data.dto
                            .AiJobRequestDto("Oi", clientMessageId = "request-1"),
                )
            val gateway = FakeAgentChatGateway().apply { recoveredJobs = listOf(job) }
            val history =
                object : AgentChatHistoryGateway by FakeAgentChatHistoryGateway() {
                    override suspend fun messages(
                        conversationId: String,
                        cursor: String?,
                    ): AgentChatHistoryResult<AgentChatMessagePageDto> =
                        AgentChatHistoryResult.Success(
                            AgentChatMessagePageDto(
                                listOf(
                                    app.braid.mobile.data.dto.AgentChatMessageDto(
                                        "assistant-1",
                                        2,
                                        "assistant",
                                        "Pronto.",
                                        emptyList(),
                                        "2026-09-22T11:02:00Z",
                                    ),
                                    app.braid.mobile.data.dto.AgentChatMessageDto(
                                        "user-message-1",
                                        1,
                                        "user",
                                        "Oi",
                                        emptyList(),
                                        "2026-09-22T11:00:00Z",
                                    ),
                                ),
                            ),
                        )
                }
            val viewModel = AgentChatViewModel(gateway, history)
            runCurrent()
            assertEquals(
                "Consultando",
                viewModel.state.value.pending
                    ?.label,
            )
            assertEquals(listOf(job), gateway.resumed)
            assertEquals(emptyList<AgentChatMessageFrameDto>(), gateway.sent)
            gateway.recoveredJobs = emptyList()
            gateway.emit(
                AgentChatEvent.Reply(
                    AgentChatReplyFrameDto("request-1", "conversation-1", 2, "Pronto.", emptyList(), emptyList(), emptyList(), emptyList()),
                ),
            )
            runCurrent()
            assertEquals("conversation-1", viewModel.state.value.conversationId)
            assertEquals(
                listOf("user-message-1", "assistant-1"),
                viewModel.state.value.messages
                    .map { it.id },
            )
            assertNull(viewModel.state.value.pending)
        }

    @Test
    fun reopenFindsConversationCreatedWhileProcessWasGone() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway =
                FakeAgentChatGateway().apply {
                    recoveredJobs =
                        listOf(
                            app.braid.mobile.data.dto.AiJobDto(
                                "job-1",
                                "agent-turn",
                                "succeeded",
                                "user-1",
                                "2026-09-22T11:00:00Z",
                                "2026-09-22T11:01:00Z",
                                result =
                                    app.braid.mobile.data.dto
                                        .AiJobResultDto("Pronto.", "new-conversation", 2),
                            ),
                        )
                }
            val viewModel = viewModel(gateway)
            runCurrent()
            val job = gateway.resumed.single()
            gateway.recoveredJobs = emptyList()
            gateway.emit(
                AgentChatEvent.Reply(
                    AgentChatReplyFrameDto(job.id, "new-conversation", 2, "Pronto.", emptyList(), emptyList(), emptyList(), emptyList()),
                ),
            )
            runCurrent()
            assertEquals("new-conversation", viewModel.state.value.conversationId)
            assertEquals(emptyList<AgentChatMessageFrameDto>(), gateway.sent)
        }

    @Test
    fun processRouteShowsTheBoxStepByStepAndRefreshesTheAgendaOnce() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeAgentChatGateway()
            val processes = FakeProcessGateway()
            val viewModel = viewModel(gateway, processes)
            runCurrent()

            viewModel.effects.test {
                viewModel.send("comendo arroz, depois vou nadar")
                runCurrent()

                val box =
                    viewModel.state.value.messages
                        .last()
                assertEquals(AgentChatMessageRole.Process, box.role)
                assertEquals(
                    "Realizando processos",
                    viewModel.state.value.pending
                        ?.label,
                )
                assertEquals(emptyList<AgentChatMessageFrameDto>(), gateway.sent)
                assertEquals("comendo arroz, depois vou nadar", processes.started.single().first)

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
    fun routeOffFallsBackToTheUsualChatAndIsNotTriedAgain() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeAgentChatGateway()
            val processes = FakeProcessGateway().apply { routeOff = true }
            val viewModel = viewModel(gateway, processes)
            runCurrent()

            viewModel.send("oi")
            runCurrent()
            assertEquals(listOf("oi"), gateway.sent.map { it.text })
            assertEquals(
                listOf(AgentChatMessageRole.User),
                viewModel.state.value.messages
                    .map { it.role },
            )

            gateway.emit(
                AgentChatEvent.Reply(
                    AgentChatReplyFrameDto(gateway.sent.single().id, "c1", 2, "Ok", emptyList(), emptyList(), emptyList(), emptyList()),
                ),
            )
            runCurrent()
            viewModel.send("de novo")
            runCurrent()
            assertEquals(listOf("oi", "de novo"), gateway.sent.map { it.text })
            assertEquals(1, processes.started.size)
        }

    @Test
    fun failedStepsStayInTheBoxAndNothingElseIsAnError() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway()
            val viewModel = viewModel(FakeAgentChatGateway(), processes)
            runCurrent()
            processes.views.add(process("completed", "succeeded", "failed", message = "Criei o evento, mas não consegui criar a nota."))

            viewModel.send("almocei e anota")
            runCurrent()

            val box =
                viewModel.state.value.messages
                    .last()
            assertEquals("Criei o evento, mas não consegui criar a nota.", box.process?.message)
            assertEquals(
                listOf(AgentChatMessageRole.User, AgentChatMessageRole.Process),
                viewModel.state.value.messages
                    .map { it.role },
            )
            assertNull(viewModel.state.value.pending)
        }

    @Test
    fun startFailureBecomesTheUsualErrorWithRetry() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway().apply { startFailure = ProcessStart.Failed(500) }
            val viewModel = viewModel(FakeAgentChatGateway(), processes)
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
        }

    @Test
    fun repeatedPollFailuresBecomeConnectionLost() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val processes = FakeProcessGateway().apply { pollFailure = ProcessPoll.Failed(500) }
            val viewModel = viewModel(FakeAgentChatGateway(), processes)
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
    fun cancelDoesNotApplyToADeliveredProcess() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeAgentChatGateway()
            val processes = FakeProcessGateway().apply { views.add(process("running", "running", "pending")) }
            val viewModel = viewModel(gateway, processes)
            runCurrent()
            viewModel.send("oi")
            runCurrent()

            viewModel.cancel()

            assertNull(gateway.cancelledId)
            assertEquals(
                false,
                viewModel.state.value.pending
                    ?.cancelling,
            )
        }

    @org.junit.After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun statusReplyAndEntityChangeUpdateConversation() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeAgentChatGateway()
            val viewModel = viewModel(gateway)
            runCurrent()

            viewModel.effects.test {
                viewModel.send("O que tenho hoje?")
                runCurrent()
                val sent = gateway.sent.single()
                gateway.emit(AgentChatEvent.Status(AgentChatStatusFrameDto(sent.id, "Consultando sua agenda")))
                runCurrent()
                assertEquals(
                    "Consultando sua agenda",
                    viewModel.state.value.pending
                        ?.label,
                )

                gateway.emit(
                    AgentChatEvent.Reply(
                        AgentChatReplyFrameDto(
                            id = sent.id,
                            conversationId = "conversation-1",
                            assistantSeq = 2,
                            agentResponse = "Você tem um treino às oito.",
                            entities = listOf(AgentChatEntityRefDto("event", "event-1", "updated", "Treino")),
                            createdEntities = emptyList<JsonObject>(),
                            updatedEntities = emptyList<JsonObject>(),
                            deletedEntities = emptyList<JsonObject>(),
                        ),
                    ),
                )
                runCurrent()

                assertNull(viewModel.state.value.pending)
                assertEquals("conversation-1", viewModel.state.value.conversationId)
                assertEquals(2, viewModel.state.value.messages.size)
                assertEquals(
                    AgentChatMessageRole.Assistant,
                    viewModel.state.value.messages
                        .last()
                        .role,
                )
                assertEquals(AgentChatUiEffect.EntitiesChanged, awaitItem())
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun serverErrorMarksRequestAndOffersRetryText() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeAgentChatGateway()
            val viewModel = viewModel(gateway)
            runCurrent()

            viewModel.send("Criar uma tarefa")
            runCurrent()
            val sent = gateway.sent.single()
            gateway.emit(AgentChatEvent.Error(sent.id, "connection_failed"))
            runCurrent()

            val state = viewModel.state.value
            assertNull(state.pending)
            assertEquals(true, state.messages.first().failed)
            assertEquals(AgentChatMessageRole.Error, state.messages.last().role)
            assertEquals("Criar uma tarefa", state.messages.last().retryText)
            assertEquals("Não consegui conectar ao assistente. Tente de novo.", state.messages.last().text)
        }

    private fun viewModel(
        gateway: FakeAgentChatGateway,
        processes: ProcessGateway = DisabledProcessGateway,
    ): AgentChatViewModel = AgentChatViewModel(gateway, FakeAgentChatHistoryGateway(), processes).apply { processPollMillis = 10 }

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

/** A rota por processo: o que o servidor respondeu ao iniciar e a fila de estados que ele devolve a cada consulta. */
private class FakeProcessGateway : ProcessGateway {
    var routeOff = false
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
        return when {
            routeOff -> ProcessStart.RouteOff
            startFailure != null -> startFailure!!
            else -> ProcessStart.Started("process-1")
        }
    }

    override suspend fun get(processId: String): ProcessPoll {
        polls += 1
        pollFailure?.let { return it }
        // O último estado conhecido se repete até o teste empurrar o próximo.
        val view = if (views.size > 1) views.removeAt(0) else views.firstOrNull()
        return view?.let { ProcessPoll.View(it) } ?: ProcessPoll.Failed()
    }
}

private class FakeAgentChatGateway : AgentChatGateway {
    private val mutableEvents = MutableSharedFlow<AgentChatEvent>(extraBufferCapacity = 8)
    val sent = mutableListOf<AgentChatMessageFrameDto>()
    var cancelledId: String? = null
    var recoveredJobs = emptyList<app.braid.mobile.data.dto.AiJobDto>()
    val resumed = mutableListOf<app.braid.mobile.data.dto.AiJobDto>()

    override val events: SharedFlow<AgentChatEvent> = mutableEvents

    override suspend fun recover(): List<app.braid.mobile.data.dto.AiJobDto> = recoveredJobs

    override suspend fun resume(job: app.braid.mobile.data.dto.AiJobDto) {
        resumed += job
    }

    override suspend fun send(message: AgentChatMessageFrameDto) {
        sent += message
    }

    override fun cancel(id: String) {
        cancelledId = id
    }

    override fun close() = Unit

    fun emit(event: AgentChatEvent) {
        mutableEvents.tryEmit(event)
    }
}

private class FakeAgentChatHistoryGateway : AgentChatHistoryGateway {
    override suspend fun conversations(cursor: String?): AgentChatHistoryResult<AgentConversationPageDto> =
        AgentChatHistoryResult.Success(AgentConversationPageDto(emptyList()))

    override suspend fun messages(
        conversationId: String,
        cursor: String?,
    ): AgentChatHistoryResult<AgentChatMessagePageDto> = AgentChatHistoryResult.Success(AgentChatMessagePageDto(emptyList()))

    override suspend fun delete(conversationId: String): AgentChatHistoryResult<Unit> = AgentChatHistoryResult.Success(Unit)
}
