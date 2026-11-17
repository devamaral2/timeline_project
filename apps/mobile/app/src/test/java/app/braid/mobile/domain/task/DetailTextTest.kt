package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.DetailRecurrenceDto
import app.braid.mobile.data.tasks.RecurrenceRuleDto
import app.braid.mobile.data.tasks.TaskDetailDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** Os textos do detalhe da tarefa, conferidos contra as funções do web (`task-read-model.ts`, `card-text.ts`, `maps-link.ts`). */
class DetailTextTest {
    private val fixture = Fixtures.json("task-detail-text").jsonObject

    private fun cases(name: String): List<JsonObject> = (fixture.getValue(name) as JsonArray).map { it.jsonObject }

    private fun JsonElement.stringOrNull(): String? = takeUnless { it is JsonNull }?.jsonPrimitive?.content

    private fun recurrence(
        rule: JsonElement,
        detached: Boolean,
    ): TaskRecurrence =
        DetailRecurrenceDto(
            id = "r",
            occurrenceOn = "2026-09-14",
            detached = detached,
            rule = BraidJson.decodeFromJsonElement(RecurrenceRuleDto.serializer(), rule),
        ).toDomain()

    @Test
    fun `moments read like the web`() {
        for (case in cases("moments")) {
            val instant = case.getValue("instant").jsonPrimitive.content
            assertEquals(instant, case.getValue("label").jsonPrimitive.content, momentLabel(Instant.parse(instant)))
        }
    }

    @Test
    fun `recurrence rules and their detail line read like the web`() {
        for (case in cases("recurrences")) {
            val rule = case.getValue("rule")
            val lines = case.getValue("lines").jsonObject
            val detached = case.getValue("detachedLines").jsonObject
            val series = recurrence(rule, detached = false)
            val loose = recurrence(rule, detached = true)

            assertEquals("$rule label", case.getValue("label").jsonPrimitive.content, recurrenceRuleLabel(series.rule))
            assertEquals("$rule rule", lines.getValue("rule").jsonPrimitive.content, recurrenceLines(series).rule)
            assertEquals("$rule detail", lines.getValue("detail").jsonPrimitive.content, recurrenceLines(series).detail)
            assertEquals("$rule detached", detached.getValue("detail").jsonPrimitive.content, recurrenceLines(loose).detail)
        }
    }

    @Test
    fun `reminders are minutes, or whole days`() {
        for (case in cases("reminders")) {
            assertEquals(
                case.getValue("minutes").toString(),
                case.getValue("label").jsonPrimitive.content,
                reminderLabel(
                    case
                        .getValue("minutes")
                        .jsonPrimitive.content
                        .toInt(),
                ),
            )
        }
    }

    @Test
    fun `the maps link encodes the location like encodeURIComponent`() {
        for (case in cases("maps")) {
            val location = case.getValue("location").jsonPrimitive.content
            assertEquals(location, case.getValue("url").jsonPrimitive.content, mapsUrl(location))
        }
    }

    @Test
    fun `the geo link searches the same text`() {
        assertEquals("geo:0,0?q=Av.%20Paulista%201578", mapsGeoUri("  Av. Paulista 1578  "))
    }

    @Test
    fun `the information rows of every task match what the web shows`() {
        for (case in cases("info")) {
            val id = case.getValue("id").jsonPrimitive.content
            val task = BraidJson.decodeFromJsonElement(TaskDetailDto.serializer(), case.getValue("task")).toDomain()
            val expected = case.getValue("info").jsonObject
            val info = taskInfo(task)

            assertEquals("$id start", expected.getValue("start").stringOrNull(), info.start)
            assertEquals("$id endLabel", expected.getValue("endLabel").jsonPrimitive.content, info.endLabel)
            assertEquals("$id end", expected.getValue("end").jsonPrimitive.content, info.end)
            assertEquals("$id duration", expected.getValue("duration").stringOrNull(), info.duration)
            assertEquals("$id persistent", expected.getValue("persistent").jsonPrimitive.boolean, info.persistent)
            val expectedRecurrence = expected.getValue("recurrence").takeUnless { it is JsonNull }?.jsonObject
            assertEquals("$id recurrence", expectedRecurrence?.getValue("rule")?.jsonPrimitive?.content, info.recurrence?.rule)
            assertEquals("$id recurrence detail", expectedRecurrence?.getValue("detail")?.jsonPrimitive?.content, info.recurrence?.detail)
            assertEquals("$id location", expected.getValue("location").stringOrNull(), info.location)
            assertEquals("$id reminders", expected.getValue("reminders").jsonArray.map { it.jsonPrimitive.content }, info.reminders)
            assertEquals("$id tags", expected.getValue("tags").jsonArray.map { it.jsonPrimitive.content }, info.tags)
            assertEquals("$id description", expected.getValue("description").stringOrNull(), info.description)
        }
    }
}
