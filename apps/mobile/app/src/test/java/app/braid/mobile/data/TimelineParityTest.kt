package app.braid.mobile.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class TimelineParityTest {
    private val json = Json { ignoreUnknownKeys = false }
    private val timeZone = ZoneId.of("America/Sao_Paulo")

    @Test
    fun dateAndWeekCalculationsMatchGeneratedTypeScriptOutputs() {
        val fixture = json.parseToJsonElement(resource("timeline-parity")).jsonObject
        fixture.getValue("dayKeys").jsonArray.forEach { entry ->
            val item = entry.jsonObject
            assertEquals(item.getValue("dayKey").jsonPrimitive.content, dayKeyOf(item.getValue("instant").jsonPrimitive.content))
        }

        val expectedWeek = fixture.getValue("week").jsonArray.map { it.jsonPrimitive.content }
        assertEquals(expectedWeek, weekOf("2026-09-22"))
    }

    private fun dayKeyOf(instant: String): String =
        Instant
            .parse(instant)
            .atZone(timeZone)
            .toLocalDate()
            .toString()

    private fun weekOf(dayKey: String): List<String> {
        val date = LocalDate.parse(dayKey)
        val sunday = date.minusDays((date.dayOfWeek.value % 7).toLong())
        return (0..6).map { sunday.plusDays(it.toLong()).toString() }
    }

    private fun resource(name: String): String = javaClass.classLoader!!.getResource("fixtures/$name.json")!!.readText()
}
