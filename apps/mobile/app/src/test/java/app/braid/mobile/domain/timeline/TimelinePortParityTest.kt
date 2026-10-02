package app.braid.mobile.domain.timeline

import app.braid.mobile.data.dto.TimelineEventPageDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class TimelinePortParityTest {
    private val json =
        Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }

    @Test
    fun dateWindowsGroupsAndPaginationMatchGeneratedTypeScriptFixture() {
        val parity =
            json
                .parseToJsonElement(resource("timeline-parity"))
                .jsonObject
        val page = json.decodeFromString<TimelineEventPageDto>(resource("timeline-page"))

        val expectedDays =
            parity.getValue("dayKeys").jsonArray.map { entry ->
                entry.jsonObject
                    .getValue("dayKey")
                    .jsonPrimitive.content
            }
        assertEquals(
            expectedDays,
            page.items.map { dayKeyOf(it.startedAt) },
        )
        assertEquals(
            parity.getValue("week").jsonArray.map { it.jsonPrimitive.content },
            weekOf("2026-09-22"),
        )

        val grouped = groupEventsByDay(page.items, "2026-09-22")
        assertEquals(
            parity.getValue("grouped").jsonArray.map {
                it.jsonObject
                    .getValue("dayKey")
                    .jsonPrimitive.content
            },
            grouped.map { it.dayKey },
        )
        val merged = mergeTimelinePage(emptyList(), page)
        assertEquals(listOf("event-training", "event-note"), merged.items.map { it.id })
        assertEquals("cursor-2", merged.nextCursor)
    }

    @Test
    fun saoPauloDayWindowHandlesTheUtcBoundary() {
        assertEquals("2026-08-31T03:00:00Z", zonedDayStart("2026-08-31").toString())
        assertEquals("2026-09-01T02:59:59.999Z", zonedDayEnd("2026-08-31").toString())
        assertEquals(TIMELINE_TIME_ZONE, "America/Sao_Paulo")
    }

    @Test
    fun runningEventsExposeNowAndAStableStopwatch() {
        val page = json.decodeFromString<TimelineEventPageDto>(resource("timeline-page"))
        val running =
            page.items.first().copy(
                startedAt = "2026-09-22T08:00:00Z",
                finishedAt = null,
            )

        assertEquals(EventPosition.Running, eventPositionOf(running, java.time.Instant.parse("2026-09-22T08:04:05Z")))
        assertEquals(245, elapsedSecondsOf(running.startedAt, java.time.Instant.parse("2026-09-22T08:04:05Z")))
        assertEquals("04:05", formatStopwatch(245))
        assertEquals("em andamento", endLabelOf(running, java.time.Instant.parse("2026-09-22T08:04:05Z")))
    }

    private fun resource(name: String): String = javaClass.classLoader!!.getResource("fixtures/$name.json")!!.readText()
}
