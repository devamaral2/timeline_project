package app.braid.mobile.ui.agenda

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
}
