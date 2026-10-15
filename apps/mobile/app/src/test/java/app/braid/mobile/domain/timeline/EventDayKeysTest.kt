package app.braid.mobile.domain.timeline

import app.braid.mobile.data.dto.TimelineEventCardDto
import org.junit.Assert.assertEquals
import org.junit.Test

class EventDayKeysTest {
    @Test
    fun eventWithoutEndOrWithinOneDayOnlyHasItsStartDay() {
        assertEquals(listOf("2026-08-18"), eventDayKeysOf("2026-08-18T13:00:00Z", null))
        assertEquals(listOf("2026-08-18"), eventDayKeysOf("2026-08-18T13:00:00Z", "2026-08-18T20:00:00Z"))
    }

    @Test
    fun eventCrossingMidnightHasStartAndEndDays() {
        assertEquals(
            listOf("2026-08-18", "2026-08-19"),
            eventDayKeysOf("2026-08-19T01:00:00Z", "2026-08-19T09:30:00Z"),
        )
    }

    @Test
    fun dayIsTheSaoPauloOneNotTheUtcOne() {
        // 23:30 e 00:30 em São Paulo; o UTC cai todo em 19.
        assertEquals(
            listOf("2026-08-18", "2026-08-19"),
            eventDayKeysOf("2026-08-19T02:30:00Z", "2026-08-19T03:30:00Z"),
        )
    }

    @Test
    fun endingExactlyAtMidnightDoesNotReachTheNextDay() {
        assertEquals(
            listOf("2026-08-18"),
            eventDayKeysOf("2026-08-19T01:00:00Z", "2026-08-19T03:00:00Z"),
        )
    }

    @Test
    fun eventsLongerThanTwoDaysIncludeEveryDayBetween() {
        assertEquals(
            listOf("2026-08-18", "2026-08-19", "2026-08-20"),
            eventDayKeysOf("2026-08-19T01:00:00Z", "2026-08-20T11:00:00Z"),
        )
    }

    @Test
    fun groupEventsByDayListsACrossingEventOnBothDays() {
        val days = groupEventsByDay(listOf(card("night", "2026-08-19T01:00:00Z", "2026-08-19T09:00:00Z")), "2026-08-19")

        assertEquals(listOf("2026-08-19", "2026-08-18"), days.map { it.dayKey })
        assertEquals(listOf("night", "night"), days.flatMap { day -> day.events.map { it.id } })
    }

    @Test
    fun eventsOnDayKeepsTheCrossingEventAndDropsOneEndingAtMidnight() {
        val crossing = card("crossing", "2026-08-19T01:00:00Z", "2026-08-19T09:00:00Z")
        val untilMidnight = card("until-midnight", "2026-08-19T01:00:00Z", "2026-08-19T03:00:00Z")

        assertEquals(listOf("crossing"), eventsOnDay("2026-08-19", listOf(crossing, untilMidnight)).map { it.id })
        assertEquals(listOf("crossing", "until-midnight"), eventsOnDay("2026-08-18", listOf(crossing, untilMidnight)).map { it.id })
    }

    private fun card(
        id: String,
        startedAt: String,
        finishedAt: String?,
    ) = TimelineEventCardDto(
        id = id,
        kind = "routine",
        noteTypes = emptyList(),
        missed = false,
        name = id,
        description = "",
        startedAt = startedAt,
        finishedAt = finishedAt,
        notifyOffsetsMinutes = emptyList(),
        durationLabel = "1h",
        tags = emptyList(),
        interruptions = emptyList(),
    )
}
