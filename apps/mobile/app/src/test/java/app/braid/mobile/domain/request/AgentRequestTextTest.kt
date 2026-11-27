package app.braid.mobile.domain.request

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.requests.RequestDto
import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.isOpenAgentStatus
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** O modelo do pedido conferido contra as funções do web (`agent-request-model.ts`, `use-agent-chat.ts`, `agent-trace.tsx`). */
class AgentRequestTextTest {
    private val fixture = Fixtures.json("agent-request-text").jsonObject

    private fun cases(name: String): List<JsonObject> = (fixture.getValue(name) as JsonArray).map { it.jsonObject }

    /** Um pedido mínimo do contrato com os [steps] e as [entities] dados, passando pelo DTO como na rede. */
    private fun requestOf(
        steps: JsonElement = JsonArray(emptyList()),
        entities: JsonElement = JsonArray(emptyList()),
    ): AgentRequest =
        BraidJson
            .decodeFromJsonElement(
                RequestDto.serializer(),
                JsonObject(
                    mapOf(
                        "id" to JsonPrimitive("r"),
                        "kind" to JsonPrimitive("request"),
                        "route" to JsonPrimitive("steps"),
                        "status" to JsonPrimitive("running"),
                        "title" to JsonPrimitive("t"),
                        "project" to
                            JsonObject(
                                mapOf(
                                    "id" to JsonPrimitive("project-personal"),
                                    "name" to JsonPrimitive("diario"),
                                    "personal" to JsonPrimitive(true),
                                ),
                            ),
                        "createdAt" to JsonPrimitive("2026-09-14T14:48:00.000Z"),
                        "updatedAt" to JsonPrimitive("2026-09-14T14:48:00.000Z"),
                        "steps" to steps,
                        "entities" to entities,
                    ),
                ),
            ).toDomain()

    private fun entityOf(entity: JsonElement): RequestEntity = requestOf(entities = JsonArray(listOf(entity))).entities.single()

    @Test
    fun `only queued, running and waiting requests are open`() {
        for (case in cases("open")) {
            val status = TaskStatus.fromCode(case.getValue("status").jsonPrimitive.content)
            assertEquals("$status", case.getValue("open").jsonPrimitive.boolean, isOpenAgentStatus(status))
        }
    }

    @Test
    fun `step progress and the running step read like the web`() {
        for (case in cases("steps")) {
            val request = requestOf(steps = case.getValue("steps"))
            val expected = case.getValue("progress").jsonObject

            assertEquals(
                StepProgress(done = expected.getValue("done").jsonPrimitive.int, total = expected.getValue("total").jsonPrimitive.int),
                stepProgress(request.steps),
            )
            val running = case.getValue("running").let { if (it is JsonNull) null else it.jsonPrimitive.content }
            assertEquals(running, runningStepLabel(request.steps))
        }
    }

    @Test
    fun `an entry reads its summary and falls back to its label`() {
        val request =
            BraidJson
                .decodeFromString(RequestDto.serializer(), Fixtures.text("request-running"))
                .toDomain()
        val expected = cases("entries").map { it.getValue("text").jsonPrimitive.content }

        assertEquals(expected, request.entries.map(::entryText))
        assertTrue("the entries keep the API order", request.entries.map { it.id } == listOf("e1", "e2", "e3"))
    }

    @Test
    fun `operations and kinds of what the request produced read like the web`() {
        for (case in cases("operations")) {
            val operation = RequestOperation.fromCode(case.getValue("operation").jsonPrimitive.content)
            assertEquals(case.getValue("label").jsonPrimitive.content, entityOperationLabel(operation))
        }
        for (case in cases("entities")) {
            val entity = entityOf(case.getValue("entity"))
            assertEquals("${case.getValue("entity")}", case.getValue("label").jsonPrimitive.content, entityKindLabel(entity))
        }
    }

    @Test
    fun `every failure code has the web text, and an unknown or missing one reads as internal`() {
        for (case in cases("failures")) {
            val code = case.getValue("code").jsonPrimitive.content
            assertEquals(code, case.getValue("text").jsonPrimitive.content, agentFailureText(code))
        }
        val internal =
            cases(
                "failures",
            ).first { it.getValue("code").jsonPrimitive.content == "internal" }.getValue("text").jsonPrimitive.content
        assertEquals(internal, agentFailureText(null))
        assertEquals(internal, agentFailureText("whatever"))
    }

    @Test
    fun `the entry kinds have the names of the web`() {
        val names = fixture.getValue("kinds").jsonObject
        assertEquals(TraceKind.entries.size, names.size)
        for (kind in TraceKind.entries) {
            assertEquals(kind.code, names.getValue(kind.code).jsonPrimitive.content, traceKindName(kind))
        }
    }
}
