package app.braid.mobile.data.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ReminderSchedulerTest {
    private val now = Instant.parse("2026-09-24T12:00:00Z")

    @Test
    fun calculatesFutureTriggersAndIgnoresOffsetsThatAlreadyPassed() {
        val triggers =
            reminderTriggersFor(
                listOf(
                    ReminderEventSource(
                        id = "event-1",
                        name = "Almoço",
                        startedAt = Instant.parse("2026-09-24T12:06:00Z"),
                        notifyOffsetsMinutes = listOf(5.0, 10.0),
                    ),
                ),
                now,
            )

        assertEquals(1, triggers.size)
        assertEquals("event-1:5.0", triggers.single().key)
        assertEquals(Instant.parse("2026-09-24T12:01:00Z"), triggers.single().triggerAt)
    }

    @Test
    fun ordersTriggersByFireTime() {
        val triggers =
            reminderTriggersFor(
                listOf(
                    ReminderEventSource(
                        id = "later",
                        name = "Depois",
                        startedAt = Instant.parse("2026-09-24T13:00:00Z"),
                        notifyOffsetsMinutes = listOf(5.0),
                    ),
                    ReminderEventSource(
                        id = "sooner",
                        name = "Antes",
                        startedAt = Instant.parse("2026-09-24T12:20:00Z"),
                        notifyOffsetsMinutes = listOf(5.0),
                    ),
                ),
                now,
            )

        assertEquals(listOf("sooner", "later"), triggers.map(ReminderTrigger::eventId))
        assertTrue(triggers.first().triggerAt.isBefore(triggers.last().triggerAt))
        assertFalse(triggers.any { it.triggerAt <= now })
    }
}
