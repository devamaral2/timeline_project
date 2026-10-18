package app.braid.mobile.ui.chat

import app.braid.mobile.data.chat.AgentChatEvent
import app.braid.mobile.data.chat.AgentChatGateway
import app.braid.mobile.data.chat.AgentChatHistoryGateway
import app.braid.mobile.data.chat.AgentChatHistoryResult
import app.braid.mobile.data.dto.AgentChatEntityRefDto
import app.braid.mobile.data.dto.AgentChatMessageFrameDto
import app.braid.mobile.data.dto.AgentChatMessagePageDto
import app.braid.mobile.data.dto.AgentChatReplyFrameDto
import app.braid.mobile.data.dto.AgentChatStatusFrameDto
import app.braid.mobile.data.dto.AgentConversationPageDto
import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
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

    private fun viewModel(gateway: FakeAgentChatGateway): AgentChatViewModel = AgentChatViewModel(gateway, FakeAgentChatHistoryGateway())
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
