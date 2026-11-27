package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** As séries, os quandos e os filtros da lista de Tarefas, conferidos contra as funções do web rodando sobre os mesmos cartões. */
class TaskListRulesTest {
    private val fixture = Fixtures.json("task-list-rules").jsonObject
    private val now = Instant.parse(fixture.getValue("now").jsonPrimitive.content)
    private val cards =
        BraidJson
            .decodeFromJsonElement(ListSerializer(TaskCardDto.serializer()), fixture.getValue("cards"))
            .map(TaskCardDto::toDomain)

    private fun strings(element: kotlinx.serialization.json.JsonElement) = element.jsonArray.map { it.jsonPrimitive.content }

    @Test
    fun `a series is one row at the position of the chosen occurrence`() {
        assertEquals(strings(fixture.getValue("rowIds")), oneRowPerSeries(cards).map { it.id })
    }

    @Test
    fun `the when of every row matches the web, with the series rule in place of the time`() {
        val byId = cards.associateBy { it.id }
        for (entry in fixture.getValue("whens").jsonArray) {
            val expected = entry.jsonObject
            val id = expected.getValue("id").jsonPrimitive.content
            val card = byId.getValue(id)
            val showsRule = showsSeriesRule(card)

            assertEquals("$id rule", expected.getValue("showsRule").jsonPrimitive.boolean, showsRule)
            assertEquals(
                "$id when",
                expected.getValue("when").jsonPrimitive.content,
                cardWhenLabel(card, now, ruleInPlaceOfTime = showsRule),
            )
        }
    }

    @Test
    fun `every recurrence rule reads as the web writes it`() {
        for (entry in fixture.getValue("rules").jsonArray) {
            val case = entry.jsonObject
            val rule = case.getValue("rule").jsonObject
            val parsed =
                RecurrenceRule(
                    frequency = RecurrenceFrequency.fromCode(rule.getValue("frequency").jsonPrimitive.content),
                    interval = rule.getValue("interval").jsonPrimitive.int,
                    byWeekday = rule["byWeekday"]?.jsonPrimitive?.int,
                    byMonthDay = rule["byMonthDay"]?.jsonPrimitive?.int,
                    byMonth = rule["byMonth"]?.jsonPrimitive?.int,
                    timeOfDay = rule.getValue("timeOfDay").jsonPrimitive.content,
                    startsOn = rule["startsOn"]?.jsonPrimitive?.content ?: "2026-01-01",
                )

            assertEquals("$rule", case.getValue("label").jsonPrimitive.content, recurrenceRuleLabel(parsed))
        }
    }

    @Test
    fun `filter counts and query parameters match the web`() {
        for (entry in fixture.getValue("filterCases").jsonArray) {
            val case = entry.jsonObject
            val raw = case.getValue("filters").jsonObject
            val filters =
                TaskFilters(
                    tag = raw["tag"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content,
                    priorities = strings(raw.getValue("priorities")).map(TaskPriority::fromCode).toSet(),
                    query = raw.getValue("query").jsonPrimitive.content,
                )
            val expected: JsonObject = case.getValue("query").jsonObject
            val query = trackedQuery(filters)

            assertEquals("$raw count", case.getValue("count").jsonPrimitive.int, filters.count)
            assertEquals("$raw tag", expected["tag"]?.jsonPrimitive?.content, query.tag)
            assertEquals("$raw priority", expected["priority"]?.let(::strings).orEmpty(), query.priorities.map { it.code })
            assertEquals("$raw q", expected["q"]?.jsonPrimitive?.content, query.query)
        }
    }

    @Test
    fun `the priority order is the web's and tags sort by use, then by name`() {
        assertEquals(strings(fixture.getValue("priorityOrder")), TaskPriority.entries.map { it.code })
        assertEquals(strings(fixture.getValue("tagsByUse")), tagsByUse(cards))
        assertEquals(mapOf("trabalho" to 3, "saúde" to 1, "casa" to 2, "áurea" to 1), tagCounts(cards))
    }
}
