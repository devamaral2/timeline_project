package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.RecurrenceSeriesDto
import app.braid.mobile.data.tasks.toBody
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TaskEditFixtures
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A lógica da recorrência no formulário, conferida contra as funções do web (`task-recurrence-draft.ts`). */
class RecurrenceFixturesTest {
    private fun cases(name: String): List<JsonObject> = Fixtures.json(name).jsonArray.map { it.jsonObject }

    private fun name(case: JsonObject): String = case.getValue("name").jsonPrimitive.content

    private fun series(element: JsonElement): RecurrenceSeries =
        BraidJson.decodeFromJsonElement(RecurrenceSeriesDto.serializer(), element).toDomain()

    private fun draft(element: JsonElement): RecurrenceDraft {
        val fields = element.jsonObject
        return RecurrenceDraft(
            frequency = RecurrenceFrequency.fromCode(fields.getValue("frequency").jsonPrimitive.content),
            interval = fields.getValue("interval").jsonPrimitive.int,
            weekdays = fields.getValue("weekdays").jsonPrimitive.int,
            monthDay = fields.getValue("monthDay").jsonPrimitive.int,
            month = fields.getValue("month").jsonPrimitive.int,
            endsOn = fields.getValue("endsOn").jsonPrimitive.content,
        )
    }

    private fun schedule(element: JsonElement): RecurrenceSchedule = TaskEditFixtures.draft(element).schedule()

    private fun errors(element: JsonElement): Map<String, String> = element.jsonObject.mapValues { it.value.jsonPrimitive.content }

    private fun RecurrenceErrors.byName(): Map<String, String> = mapKeys { it.key.name.replaceFirstChar(Char::lowercase) }

    @Test
    fun `a new draft starts weekly on the weekday and day of the start date`() {
        for (case in cases("recurrence-empty-drafts")) {
            val startDate = case.getValue("startDate").jsonPrimitive.content
            assertEquals(startDate, draft(case.getValue("draft")), emptyRecurrenceDraft(startDate))
        }
    }

    @Test
    fun `the draft of a series read is its rule`() {
        for (case in cases("recurrence-draft-from-rule")) {
            assertEquals(name(case), draft(case.getValue("draft")), recurrenceDraftFromRule(series(case.getValue("series")).rule))
        }
    }

    @Test
    fun `a new series is refused where the web refuses it, with its words`() {
        for (case in cases("recurrence-new-validation")) {
            val actual = validateNewRecurrence(draft(case.getValue("draft")), schedule(case.getValue("form"))).byName()
            assertEquals(name(case), errors(case.getValue("errors")), actual)
        }
    }

    @Test
    fun `editing a series is refused where the web refuses it, with its words`() {
        for (case in cases("recurrence-edit-validation")) {
            val actual = validateSeriesEdit(series(case.getValue("series")), draft(case.getValue("draft"))).byName()
            assertEquals(name(case), errors(case.getValue("errors")), actual)
        }
    }

    @Test
    fun `a task that joins a series leaves it as is and the series starts the next day`() {
        for (case in cases("recurrence-schedule-after")) {
            assertEquals(name(case), schedule(case.getValue("shifted")), scheduleAfterTask(schedule(case.getValue("form"))))
        }
    }

    @Test
    fun `the create body is the one the web builds`() {
        for (case in cases("recurrence-create-cases")) {
            val form = TaskEditFixtures.draft(case.getValue("form"))
            val body = buildNewSeries(draft(case.getValue("draft")), form, case.getValue("timeZone").jsonPrimitive.content).toBody()
            assertEquals(name(case), case.getValue("input").jsonObject, body)
        }
    }

    @Test
    fun `the series patch holds only the rule that changed, as the web builds it`() {
        for (case in cases("recurrence-plan-cases")) {
            val patch = planSeriesEdit(series(case.getValue("series")), draft(case.getValue("draft")))
            val expected = case.getValue("patch")
            if (expected is JsonNull) {
                assertNull(name(case), patch)
            } else {
                assertEquals(name(case), expected.jsonObject, patch?.toBody())
            }
        }
    }
}
