package app.braid.mobile.ui.chat

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.requests.RequestDto
import app.braid.mobile.data.requests.toDomain
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
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * O que entra na conversa e o que a linha de status diz (as regras de `agent-chat-panel.tsx`, `process-answer.tsx` e
 * `pending-step.ts` do web; a da linha de status confere contra a fixture gerada da função TS, as outras moram no JSX
 * do web e ficam escritas aqui): o andamento de um pedido e os passos do Hermes ficam na aba "Processo", e só o passo atual
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

    /** Uma mensagem do chat do web, como o gerador a gravou, na mensagem do app. */
    private fun messageOf(element: JsonElement): ChatMessage {
        val message = element.jsonObject
        val id = message.getValue("id").jsonPrimitive.content
        return when (val role = message.getValue("role").jsonPrimitive.content) {
            "user" -> ChatMessage.User(id, message.getValue("text").jsonPrimitive.content)
            "process" ->
                ChatMessage.Process(
                    id,
                    message.getValue("request").takeUnless { it is JsonNull }?.let {
                        BraidJson.decodeFromJsonElement(RequestDto.serializer(), it).toDomain()
                    },
                )
            "hermes-steps" ->
                ChatMessage.HermesSteps(
                    id,
                    steps =
                        message.getValue("steps").jsonArray.map {
                            val step = it.jsonObject
                            HermesStep(
                                id = step.getValue("id").jsonPrimitive.content,
                                kind = requireNotNull(TraceKind.fromCodeOrNull(step.getValue("kind").jsonPrimitive.content)),
                                label = step.getValue("label").jsonPrimitive.content,
                                detail = step["detail"]?.jsonPrimitive?.content,
                                status = TraceStatus.fromCode(step.getValue("status").jsonPrimitive.content),
                            )
                        },
                    running = message.getValue("running").jsonPrimitive.boolean,
                )
            else -> error("Mensagem sem tradução no teste: $role")
        }
    }

    @Test
    fun `the status line says the step the web says, for steps, Hermes and the model`() {
        // Os casos e as respostas vêm de `pendingStepLabel` (`pending-step.ts`), pelo gerador de fixtures.
        for (case in fixtureCases("chat-functions", "pendingStepLabel")) {
            val pending = case.args[1].jsonObject
            val actual =
                pendingStepLabel(
                    case.args[0].jsonArray.map(::messageOf),
                    ChatPending(
                        id = pending.getValue("id").jsonPrimitive.content,
                        label = pending["label"]?.jsonPrimitive?.content,
                        requestId = pending["requestId"]?.jsonPrimitive?.content,
                    ),
                )
            assertEquals(case.toString(), case.resultString, actual)
        }
    }
}
