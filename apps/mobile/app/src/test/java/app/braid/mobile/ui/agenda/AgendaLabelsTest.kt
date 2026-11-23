package app.braid.mobile.ui.agenda

import app.braid.mobile.domain.agenda.FreeSlot
import org.junit.Assert.assertEquals
import org.junit.Test

class AgendaLabelsTest {
    @Test
    fun `the month toggle drops the year in the current year only`() {
        assertEquals("Setembro", monthName("2026-09-14", todayKey = "2026-09-14"))
        assertEquals("Janeiro", monthName("2026-01-02", todayKey = "2026-09-14"))
        assertEquals("Setembro de 2027", monthName("2027-09-01", todayKey = "2026-09-14"))
        assertEquals("Dezembro de 2025", monthName("2025-12-31", todayKey = "2026-09-14"))
    }

    @Test
    fun `the open picker reads month and year without the preposition`() {
        assertEquals("Maio 2026", pickerMonthTitle("2026-05-22"))
    }

    private fun slot(
        start: String,
        end: String,
        minutes: Int,
        midnight: Boolean = false,
    ) = FreeSlot(
        java.time.Instant
            .parse(start)
            .toEpochMilli(),
        java.time.Instant
            .parse(end)
            .toEpochMilli(),
        minutes,
        midnight,
    )

    @Test
    fun `a free window reads its hours in Sao Paulo, and midnight as 24-00`() {
        val evening = slot("2026-09-15T00:00:00Z", "2026-09-15T03:00:00Z", 180, midnight = true)
        assertEquals("21:00", freeStartLabel(evening))
        assertEquals("24:00", freeEndLabel(evening))
        assertEquals("21:00 — 24:00", freeRangeLabel(evening))

        val morning = slot("2026-09-14T13:00:00Z", "2026-09-14T15:30:00Z", 150)
        assertEquals("10:00 — 12:30", freeRangeLabel(morning))
    }

    @Test
    fun `a free duration is hours and minutes, with a unit only where there is something`() {
        assertEquals("15min", freeDurationLabel(15))
        assertEquals("1h", freeDurationLabel(60))
        assertEquals("1h 5min", freeDurationLabel(65))
        assertEquals("2h 30min", freeDurationLabel(150))
        assertEquals("24h", freeDurationLabel(1440))
    }
}
