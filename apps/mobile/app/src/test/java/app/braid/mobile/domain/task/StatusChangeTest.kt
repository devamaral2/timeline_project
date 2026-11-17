package app.braid.mobile.domain.task

import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** As regras da troca de status, conferidas contra `statusPatch`, `humanStatusOptions` e `hasOpenAgentTask` do web. */
class StatusChangeTest {
    private val fixture = Fixtures.json("tasks-status-change").jsonObject
    private val now = Instant.parse(fixture.getValue("now").jsonPrimitive.content)

    private fun card(
        actor: TaskActor = TaskActor.Human,
        status: TaskStatus? = null,
        revision: Int = 1,
        longRunning: Boolean = false,
    ) = TaskCard(
        id = "task",
        actor = actor,
        kind = TaskKind.Common,
        status = status,
        name = "Tarefa",
        startedAt = null,
        estimatedFinishAt = null,
        longRunning = longRunning,
        tags = emptyList(),
        revision = revision,
    )

    private fun statusOf(element: kotlinx.serialization.json.JsonElement): TaskStatus? =
        if (element is JsonNull) null else TaskStatus.fromCode(element.jsonPrimitive.content)

    @Test
    fun `the patch of every status change is the one the web builds`() {
        val cases = fixture.getValue("patches") as JsonArray
        for (entry in cases) {
            val case = entry.jsonObject
            val from = statusOf(case.getValue("from"))
            val to = checkNotNull(statusOf(case.getValue("to")))
            val expected = case.getValue("patch").jsonObject

            val patch = statusPatch(card(status = from, revision = case.getValue("revision").jsonPrimitive.int), to, now)

            val label = "${from?.code} -> ${to.code}"
            assertEquals(label, expected.getValue("expectedRevision").jsonPrimitive.int, patch.expectedRevision)
            assertEquals(label, expected.getValue("status").jsonPrimitive.content, patch.status.code)
            val finishedAt = expected["finishedAt"]
            val expectedChange =
                when {
                    finishedAt == null -> FinishedAtChange.Unchanged
                    finishedAt is JsonNull -> FinishedAtChange.Cleared
                    else -> FinishedAtChange.Set(Instant.parse(finishedAt.jsonPrimitive.content))
                }
            assertEquals(label, expectedChange, patch.finishedAt)
        }
    }

    @Test
    fun `the picker offers the seven person statuses, and a long task never gets missed`() {
        for (entry in fixture.getValue("options") as JsonArray) {
            val case = entry.jsonObject
            val expected = (case.getValue("statuses") as JsonArray).map { it.jsonPrimitive.content }

            val options = humanStatusOptions(longRunning = case.getValue("longRunning").jsonPrimitive.boolean)

            assertEquals(expected, options.map { it.code })
        }
    }

    @Test
    fun `only an agent task in the queue, running or waiting is open`() {
        for (entry in fixture.getValue("openAgent") as JsonArray) {
            val case = entry.jsonObject
            val actor = if (case.getValue("actor").jsonPrimitive.content == "agent") TaskActor.Agent else TaskActor.Human
            val status = statusOf(case.getValue("status"))

            val open = hasOpenAgentTask(listOf(card(actor = actor, status = status)))

            assertEquals("${actor.name} ${status?.code}", case.getValue("open").jsonPrimitive.boolean, open)
        }
    }
}
