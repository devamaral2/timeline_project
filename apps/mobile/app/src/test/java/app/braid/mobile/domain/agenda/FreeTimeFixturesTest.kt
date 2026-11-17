package app.braid.mobile.domain.agenda

import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Test

/** `freeTimeSlots` e `freeWindowGrade` contra o que as funções TS devolveram para as mesmas entradas. */
class FreeTimeFixturesTest {
    private val fixture = Fixtures.json("agenda-free-time").jsonObject

    private fun cases(name: String): JsonArray = fixture.getValue(name).jsonArray

    private fun spanOf(element: JsonElement): TimeSpan {
        val span = element.jsonObject
        return TimeSpan(
            span.getValue("startMs").jsonPrimitive.long,
            span
                .getValue("endMs")
                .takeUnless { it is JsonNull }
                ?.jsonPrimitive
                ?.long,
        )
    }

    private fun slotOf(element: JsonElement): FreeSlot {
        val slot = element.jsonObject
        return FreeSlot(
            startMs = slot.getValue("startMs").jsonPrimitive.long,
            endMs = slot.getValue("endMs").jsonPrimitive.long,
            minutes = slot.getValue("minutes").jsonPrimitive.int,
            endsAtMidnight = slot.getValue("endsAtMidnight").jsonPrimitive.boolean,
        )
    }

    @Test
    fun `the smallest window that is listed is 15 minutes`() {
        assertEquals(fixture.getValue("minimumMinutes").jsonPrimitive.int, MIN_FREE_WINDOW_MINUTES)
    }

    @Test
    fun `free slots are the ones the TS function finds, including the 23 hour day`() {
        for (case in cases("slots")) {
            val args = case.jsonObject.getValue("args").jsonArray
            val spans = args[0].jsonArray.map(::spanOf)
            val dayKey = args[1].jsonPrimitive.content
            val expected =
                case.jsonObject
                    .getValue("result")
                    .jsonArray
                    .map(::slotOf)
            assertEquals("$dayKey $spans", expected, freeTimeSlots(spans, dayKey))
        }
    }

    @Test
    fun `the colour ramp of a window follows the TS grade`() {
        for (case in cases("grades")) {
            val minutes =
                case.jsonObject
                    .getValue("args")
                    .jsonArray[0]
                    .jsonPrimitive.int
            val result = case.jsonObject.getValue("result").jsonObject
            assertEquals(
                "minutes=$minutes",
                FreeWindowGrade(result.getValue("low").jsonPrimitive.int, result.getValue("high").jsonPrimitive.int),
                freeWindowGrade(minutes),
            )
        }
    }
}
