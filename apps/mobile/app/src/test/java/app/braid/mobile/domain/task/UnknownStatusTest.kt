package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.requests.RequestDto
import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.support.Fixtures
import app.braid.mobile.ui.tasks.taskStatusName
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** Um status que a API manda e este app não conhece lê-se como [TaskStatus.Unknown], sem erro, em cartão, pedido e passo. */
class UnknownStatusTest {
    private val unknownCode = JsonPrimitive("paused_by_the_future")

    private fun JsonObject.withStatus(status: JsonElement) = JsonObject(this + ("status" to status))

    @Test
    fun `a card with an unknown status reads as unknown`() {
        val card =
            Fixtures
                .json("task-list-nesting")
                .jsonObject
                .getValue("cards")
                .jsonArray
                .first { it.jsonObject["actor"] == JsonPrimitive("agent") }
                .jsonObject

        val read = BraidJson.decodeFromJsonElement(TaskCardDto.serializer(), card.withStatus(unknownCode)).toDomain()

        assertEquals(TaskStatus.Unknown, read.status)
        assertEquals(TaskActor.Agent, read.actor)
        assertEquals("Agente", taskStatusName(read.actor, read.status))
    }

    @Test
    fun `a request with an unknown status reads as unknown`() {
        val request = Fixtures.json("request-running").jsonObject.withStatus(unknownCode)

        val read = BraidJson.decodeFromJsonElement(RequestDto.serializer(), request).toDomain()

        assertEquals(TaskStatus.Unknown, read.status)
        assertEquals(listOf(TaskStatus.Done, TaskStatus.Running, TaskStatus.Queued), read.steps.map { it.status })
    }

    @Test
    fun `a step with an unknown status reads as unknown`() {
        val request = Fixtures.json("request-running").jsonObject
        val steps = request.getValue("steps").jsonArray
        val withUnknownStep =
            request +
                (
                    "steps" to
                        JsonArray(
                            steps.map {
                                if (it.jsonObject["id"] ==
                                    JsonPrimitive("s2")
                                ) {
                                    it.jsonObject.withStatus(unknownCode)
                                } else {
                                    it
                                }
                            },
                        )
                )

        val read = BraidJson.decodeFromJsonElement(RequestDto.serializer(), JsonObject(withUnknownStep)).toDomain()

        assertEquals(TaskStatus.Running, read.status)
        assertEquals(listOf(TaskStatus.Done, TaskStatus.Unknown, TaskStatus.Queued), read.steps.map { it.status })
    }
}
