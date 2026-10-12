package app.braid.mobile.domain.timeline

import app.braid.mobile.data.dto.WorkoutSetDto
import org.junit.Assert.assertEquals
import org.junit.Test

class EventDetailFormatTest {
    @Test
    fun formatsMinutes() {
        assertEquals("30 min", formatMinutes(30.0))
        assertEquals("1 h", formatMinutes(60.0))
        assertEquals("7 h 30", formatMinutes(450.0))
    }

    @Test
    fun formatsPace() {
        assertEquals("6′15″/km", formatPace(6.25))
        assertEquals("6′00″/km", formatPace(5.999))
    }

    @Test
    fun describesSingleDayAndOvernightWindows() {
        assertEquals(
            "Segunda-feira, 14 de setembro",
            dateLineOf("2026-09-14T10:00:00.000Z", "2026-09-14T11:00:00.000Z"),
        )
        assertEquals(
            "Domingo, 13 → segunda, 14 de setembro",
            dateLineOf("2026-09-14T02:10:00.000Z", "2026-09-14T09:40:00.000Z"),
        )
    }

    @Test
    fun groupsSetsByExerciseInOrder() {
        val sets =
            listOf(
                WorkoutSetDto("1", "Supino", 10, 40.0),
                WorkoutSetDto("2", "Remada", 8, 30.0),
                WorkoutSetDto("3", "Supino", 8, 50.0),
            )
        assertEquals(listOf("Supino" to 2, "Remada" to 1), groupSetsByExercise(sets).map { it.first to it.second.size })
    }

    @Test
    fun durationPartsSplitHoursAndMinutes() {
        assertEquals(listOf(DurationPart(30, "min")), durationPartsOf("2026-09-14T08:15:00Z", "2026-09-14T08:45:00Z"))
        assertEquals(listOf(DurationPart(1, "h")), durationPartsOf("2026-09-14T07:00:00Z", "2026-09-14T08:00:00Z"))
        assertEquals(
            listOf(DurationPart(1, "h"), DurationPart(25, "min")),
            durationPartsOf("2026-09-14T07:00:00Z", "2026-09-14T08:25:00Z"),
        )
    }
}
