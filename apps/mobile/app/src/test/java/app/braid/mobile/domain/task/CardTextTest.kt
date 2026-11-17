package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** Os textos da linha da tarefa, conferidos contra `card-text.ts` e `agenda-data.ts` rodando sobre os mesmos cartões. */
class CardTextTest {
    private val textFixture = Fixtures.json("tasks-card-text").jsonObject
    private val now = Instant.parse(textFixture.getValue("now").jsonPrimitive.content)

    private fun cards(fixture: JsonObject): List<TaskCard> =
        BraidJson
            .decodeFromJsonElement(ListSerializer(TaskCardDto.serializer()), fixture.getValue("cards"))
            .map(TaskCardDto::toDomain)

    @Test
    fun `when, overdue and duration of every card match the web`() {
        val cards = cards(textFixture).associateBy { it.id }
        for (entry in textFixture.getValue("expected") as JsonArray) {
            val expected = entry.jsonObject
            val id = expected.getValue("id").jsonPrimitive.content
            val card = cards.getValue(id)

            assertEquals("$id when", expected.getValue("when").jsonPrimitive.content, cardWhenLabel(card, now))
            assertEquals("$id overdue", expected.getValue("overdue").jsonPrimitive.boolean, cardIsOverdue(card, now))
            assertEquals(
                "$id duration",
                expected
                    .getValue("duration")
                    .takeUnless { it is JsonNull }
                    ?.jsonPrimitive
                    ?.content,
                cardDurationLabel(card),
            )
        }
    }

    @Test
    fun `elapsed time reads as now, minutes, hours and days`() {
        for (entry in textFixture.getValue("elapsed") as JsonArray) {
            val case = entry.jsonObject
            val instant = Instant.parse(case.getValue("instant").jsonPrimitive.content)
            assertEquals("$instant", case.getValue("result").jsonPrimitive.content, elapsedLabel(instant, now))
        }
    }

    @Test
    fun `the agenda drops long tasks, steps and tasks without a start`() {
        val grouping = Fixtures.json("tasks-agenda-grouping").jsonObject
        val cards = cards(grouping)

        assertEquals(
            (grouping.getValue("agendaCardIds") as JsonArray).map { it.jsonPrimitive.content },
            cards.filter { it.isAgendaCard() }.map { it.id },
        )
    }

    @Test
    fun `tasks group by day as the web does, crossing midnight into both days`() {
        val grouping = Fixtures.json("tasks-agenda-grouping").jsonObject
        val byDay = agendaTasksByDay(cards(grouping) + cards(grouping).take(3))

        val expected =
            grouping.getValue("idsByDay").jsonObject.mapValues { (_, ids) -> (ids as JsonArray).map { it.jsonPrimitive.content } }
        assertEquals(expected, byDay.mapValues { (_, tasks) -> tasks.map { it.id } })
        // A noite de "Dormir" e "Jantar" passa da meia-noite local: as duas aparecem nos dois dias.
        assertEquals(true, "task-6" in byDay.getValue("2026-09-14").map { it.id })
        assertEquals(true, "task-6" in byDay.getValue("2026-09-15").map { it.id })
    }
}
