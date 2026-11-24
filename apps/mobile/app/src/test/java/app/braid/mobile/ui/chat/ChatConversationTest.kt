package app.braid.mobile.ui.chat

import app.braid.mobile.domain.chat.HermesStep
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.QueryTable
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.RequestStep
import app.braid.mobile.domain.request.TraceKind
import app.braid.mobile.domain.request.TraceStatus
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * O que entra na conversa e o que a linha de status diz (as regras de `agent-chat-panel.tsx`, `process-answer.tsx` e
 * `pending-step.ts` do web): o andamento de um pedido e os passos do Hermes ficam na aba "Processo", e só o passo atual
 * vai na linha de status do campo.
 */
class ChatConversationTest {
    private val at = Instant.parse("2026-11-14T12:00:00Z")
    private val step = RequestStep(id = "1", agent = "task-create", label = "Criando tarefas", status = TaskStatus.Done)
    private val written =
        RequestEntity(
            kind = EntityKind.Task,
            id = "e1",
            name = "Comprar faixa elástica",
            artifactType = null,
            operation = RequestOperation.Create,
        )

    private fun request(
        status: TaskStatus,
        message: String? = null,
        steps: List<RequestStep> = listOf(step),
        entities: List<RequestEntity> = emptyList(),
    ) = AgentRequest(
        id = "r1",
        kind = TaskKind.Request,
        status = status,
        title = "Criar duas tarefas",
        sessionId = null,
        createdAt = at,
        updatedAt = at,
        progress = null,
        errorCode = null,
        steps = steps,
        entities = entities,
        entries = emptyList(),
        message = message,
    )

    @Test
    fun `a request still running leaves nothing in the conversation`() {
        assertFalse(processAnswerShows(null))
        assertFalse(processAnswerShows(request(TaskStatus.Queued)))
        assertFalse(processAnswerShows(request(TaskStatus.Running, entities = listOf(written))))
    }

    @Test
    fun `a finished request shows its answer, its query rows or what it wrote`() {
        assertTrue(processAnswerShows(request(TaskStatus.Done, message = "Criei duas tarefas.")))
        val query = step.copy(result = QueryTable(columns = listOf("name"), rows = emptyList(), truncated = false))
        assertTrue(processAnswerShows(request(TaskStatus.Done, steps = listOf(query))))
        assertTrue(processAnswerShows(request(TaskStatus.Done, entities = listOf(written))))
        assertFalse(processAnswerShows(request(TaskStatus.Done)))
    }

    @Test
    fun `a failed or cancelled request keeps only what it wrote before stopping`() {
        // O aviso é a mensagem de erro da conversa: o texto do pedido que falhou não vira balão.
        assertFalse(processAnswerShows(request(TaskStatus.Failed, message = "Não deu.")))
        assertTrue(processAnswerShows(request(TaskStatus.Cancel, entities = listOf(written))))
    }

    @Test
    fun `the conversation lists messages and answers, never the steps`() {
        val messages =
            listOf(
                ChatMessage.User("u1", "crie duas tarefas"),
                ChatMessage.Process("u1-process", request(TaskStatus.Done, message = "Criei duas tarefas.")),
                ChatMessage.User("u2", "que horas são?"),
                ChatMessage.HermesSteps("u2-steps", steps = emptyList(), running = true),
                ChatMessage.Process("u3-process", request(TaskStatus.Running)),
                ChatMessage.Assistant("u2-answer", "São 18h."),
                ChatMessage.Error("u4-error", "Pedido cancelado.", retryText = "", messageId = "u4", reuseMessageId = false),
            )
        assertEquals(
            listOf("u1", "u1-process", "u2", "u2-answer", "u4-error"),
            messages.filter { it.inConversation() }.map { it.id },
        )
    }

    private val pending = ChatPending(id = "m1", label = "Realizando processos", requestId = "r1")

    private fun running(steps: List<RequestStep>) = ChatMessage.Process("m1-process", request(TaskStatus.Running, steps = steps))

    @Test
    fun `before the server unfolds the request the status line says it is being understood`() {
        assertEquals("Entendendo o pedido", pendingStepLabel(listOf(ChatMessage.Process("m1-process", null)), pending))
        assertEquals("Entendendo o pedido", pendingStepLabel(listOf(running(emptyList())), pending))
    }

    @Test
    fun `a request in steps shows the running step, else the next in line, else the last`() {
        val active = step.copy(id = "2", label = "Criando notas", status = TaskStatus.Running)
        val queued = step.copy(id = "3", label = "Editando tarefas", status = TaskStatus.Queued)
        assertEquals("Criando notas", pendingStepLabel(listOf(running(listOf(step, active, queued))), pending))
        assertEquals("Editando tarefas", pendingStepLabel(listOf(running(listOf(step, queued))), pending))
        assertEquals("Criando tarefas", pendingStepLabel(listOf(running(listOf(step))), pending))
    }

    @Test
    fun `Hermes and the model show the tool or thought in course, else the last one`() {
        fun steps(last: TraceStatus) =
            ChatMessage.HermesSteps(
                "m1-steps",
                steps =
                    listOf(
                        HermesStep("a", TraceKind.Thought, "Pensou", detail = null, status = TraceStatus.Done),
                        HermesStep("b", TraceKind.Tool, "Executou um comando", detail = "date", status = last),
                    ),
                running = true,
            )
        assertEquals("Executou um comando", pendingStepLabel(listOf(steps(TraceStatus.Running)), pending.copy(label = "Hermes")))
        assertEquals("Executou um comando", pendingStepLabel(listOf(steps(TraceStatus.Done)), pending.copy(label = "Hermes")))
    }

    @Test
    fun `with no step the request label stays, and only the steps of the running request count`() {
        val other =
            ChatMessage.HermesSteps(
                "m0-steps",
                steps = listOf(HermesStep("a", TraceKind.Tool, "Buscou na web", detail = null, status = TraceStatus.Done)),
                running = false,
            )
        assertEquals("Haiku 5.5", pendingStepLabel(listOf(other), pending.copy(label = "Haiku 5.5")))
        assertEquals("Pensando", pendingStepLabel(emptyList(), ChatPending(id = "m1", label = null)))
    }
}
