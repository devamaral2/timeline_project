package app.braid.mobile.domain.assistant

import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/** A linha de quando do cartão do assistente: a timeline é de São Paulo (UTC-3), então 18:00Z é 15:00. */
class AssistantRecordTest {
    private fun card(
        start: String?,
        end: String? = null,
        longRunning: Boolean = false,
    ) = TaskCard(
        id = "task-1",
        actor = TaskActor.Human,
        kind = TaskKind.Common,
        status = TaskStatus.Todo,
        name = "Reunião com a Ana",
        startedAt = start?.let(Instant::parse),
        estimatedFinishAt = end?.let(Instant::parse),
        longRunning = longRunning,
        tags = emptyList(),
        revision = 1,
    )

    @Test
    fun `a timed task that ends on the same day shows the day and both times`() {
        assertEquals("Qui, 26 nov · 15:00 — 16:00", recordWhenLabel(card("2026-11-26T18:00:00Z", "2026-11-26T19:00:00Z")))
    }

    @Test
    fun `without an end, or with one on another day, only the start shows`() {
        assertEquals("Qui, 26 nov · 15:00", recordWhenLabel(card("2026-11-26T18:00:00Z")))
        assertEquals("Qui, 26 nov · 15:00", recordWhenLabel(card("2026-11-26T18:00:00Z", "2026-11-27T19:00:00Z")))
    }

    @Test
    fun `a day without a time shows only the date`() {
        assertEquals("Qui, 26 nov", recordWhenLabel(card("2026-11-26T03:00:00Z", "2026-11-26T19:00:00Z")))
    }

    @Test
    fun `a task without a date has no line`() {
        assertNull(recordWhenLabel(card(start = null)))
    }

    @Test
    fun `a long task shows its deadline, when it has one`() {
        assertEquals("Prazo Seg, 30 nov", recordWhenLabel(card(start = null, end = "2026-11-30T03:00:00Z", longRunning = true)))
        assertNull(recordWhenLabel(card(start = "2026-11-26T18:00:00Z", longRunning = true)))
    }
}
