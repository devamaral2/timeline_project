package app.braid.mobile.domain.timeline

import app.braid.mobile.data.dto.TimelineEventCardDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FreeTimeTest {
    private val day = "2026-09-14"

    private fun event(
        id: String,
        start: String,
        end: String?,
    ) = TimelineEventCardDto(
        id = id,
        kind = "routine",
        noteTypes = emptyList(),
        missed = false,
        name = id,
        description = "",
        startedAt =
            "2026-09-14T$start:00-03:00".let {
                java.time.OffsetDateTime
                    .parse(it)
                    .toInstant()
                    .toString()
            },
        finishedAt =
            end?.let {
                java.time.OffsetDateTime
                    .parse("2026-09-14T$it:00-03:00")
                    .toInstant()
                    .toString()
            },
        notifyOffsetsMinutes = emptyList(),
        durationLabel = "",
        tags = emptyList(),
        interruptions = emptyList(),
    )

    private fun minutes(vararg events: TimelineEventCardDto) = freeTimeSlotsOf(events.toList(), day).map { it.minutes }

    @Test
    fun fillsTheGapBetweenEventsAndTheStretchAfterTheLastOne() {
        val slots = freeTimeSlotsOf(listOf(event("a", "13:00", "14:00"), event("b", "20:00", "21:00")), day)

        assertEquals(listOf(360, 180), slots.map { it.minutes })
        assertEquals("2026-09-14T17:00:00Z", slots[0].start.toString())
        assertEquals(false, slots[0].endsAtMidnight)
        assertEquals("2026-09-15T03:00:00Z", slots[1].end.toString())
        assertTrue(slots[1].endsAtMidnight)
    }

    @Test
    fun noFreeTimeBeforeTheFirstEventBetweenTouchingEventsOrPastMidnight() {
        assertEquals(
            listOf(1),
            minutes(
                event("a", "07:00", "08:00"),
                event("b", "08:00", "09:00"),
                event("c", "09:00", "23:30"),
                event("d", "23:00", "23:59"),
            ),
        )
        assertEquals(emptyList<Int>(), minutes(event("night", "22:00", null).copy(finishedAt = "2026-09-15T09:00:00Z")))
    }

    @Test
    fun overlappingEventsCountAsOneBlockAndOrderDoesNotMatter() {
        assertEquals(
            listOf(60, 600),
            minutes(event("c", "13:00", "14:00"), event("a", "09:00", "12:00"), event("b", "10:00", "11:00")),
        )
    }

    @Test
    fun anEventWithoutAnEndStopsTheCalculationAfterIt() {
        assertEquals(
            listOf(60),
            minutes(event("a", "07:00", "08:00"), event("b", "09:00", null), event("c", "12:00", "13:00")),
        )
    }

    @Test
    fun entriesInterleaveEventsAndFreeTimeChronologically() {
        val entries = agendaEntriesOf(listOf(event("b", "20:00", "21:00"), event("a", "08:00", "09:00")), day)

        assertEquals(
            listOf("e:a", "free:${entries[1].let { (it as AgendaEntry.FreeTime).slot.start.toEpochMilli() }}", "e:b"),
            entries.take(3).map { it.key },
        )
        assertTrue(entries[1] is AgendaEntry.FreeTime)
        assertTrue(entries[3] is AgendaEntry.FreeTime)
        assertEquals(4, entries.size)
    }

    @Test
    fun aDayWithoutEventsHasNoFreeTime() {
        assertEquals(emptyList<FreeTimeSlot>(), freeTimeSlotsOf(emptyList(), day))
    }
}
