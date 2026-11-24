package app.braid.mobile.domain.reminder

import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** Os textos da tela cheia do lembrete: só o Android a tem, então não há fixture do web para comparar. */
class ReminderAlertTest {
    private val zone = ZoneId.of("America/Sao_Paulo")

    /** 14:30 em São Paulo. */
    private val anchor = Instant.parse("2026-09-14T17:30:00Z")

    private fun remainingBefore(before: Duration) = remainingTimeOf(anchor, anchor.minus(before))

    private fun card(
        kind: TaskKind,
        longRunning: Boolean,
    ) = TaskCard(
        id = "task",
        actor = TaskActor.Human,
        kind = kind,
        status = TaskStatus.Todo,
        name = "Treino de pernas",
        startedAt = anchor,
        estimatedFinishAt = anchor.plus(Duration.ofHours(1)),
        longRunning = longRunning,
        tags = emptyList(),
        revision = 1,
        notifyOffsetsMinutes = listOf(30),
    )

    @Test
    fun `a reminder carries the task kind and whether its anchor is a deadline`() {
        val training = remindersOf(listOf(card(TaskKind.Training, longRunning = false))).single()
        assertEquals(TaskKind.Training, training.taskKind)
        assertEquals(false, training.deadline)

        val long = remindersOf(listOf(card(TaskKind.Common, longRunning = true))).single()
        assertEquals(TaskKind.Common, long.taskKind)
        assertEquals(true, long.deadline)
        assertEquals(anchor.plus(Duration.ofHours(1)), long.anchor)
    }

    @Test
    fun `under two hours the remaining time is in minutes, rounded up`() {
        assertEquals(RemainingTime(30, "minutos"), remainingBefore(Duration.ofMinutes(30)))
        // O alarme chegou 20 s atrasado: ainda são "30 minutos".
        assertEquals(RemainingTime(30, "minutos"), remainingBefore(Duration.ofMinutes(30).minusSeconds(20)))
        assertEquals(RemainingTime(1, "minuto"), remainingBefore(Duration.ofSeconds(5)))
        assertEquals(RemainingTime(119, "minutos"), remainingBefore(Duration.ofMinutes(119)))
    }

    @Test
    fun `from two hours to a day it is in hours, rounded to the nearest`() {
        assertEquals(RemainingTime(2, "horas"), remainingBefore(Duration.ofMinutes(120)))
        assertEquals(RemainingTime(3, "horas"), remainingBefore(Duration.ofMinutes(150)))
        assertEquals(RemainingTime(24, "horas"), remainingBefore(Duration.ofMinutes(1439)))
    }

    @Test
    fun `from a day on it is in days`() {
        assertEquals(RemainingTime(1, "dia"), remainingBefore(Duration.ofDays(1)))
        assertEquals(RemainingTime(3, "dias"), remainingBefore(Duration.ofDays(3)))
        assertEquals(RemainingTime(30, "dias"), remainingBefore(Duration.ofDays(30)))
    }

    @Test
    fun `nothing remains once the time has come`() {
        assertNull(remainingTimeOf(anchor, anchor))
        assertNull(remainingTimeOf(anchor, anchor.plusSeconds(60)))
    }

    @Test
    fun `the lead agrees with the amount`() {
        assertEquals("Falta", RemainingTime(1, "minuto").lead)
        assertEquals("Faltam", RemainingTime(30, "minutos").lead)
    }

    @Test
    fun `meal, sleep and training have their own label and the rest is a task`() {
        assertEquals("Refeição", alertKindLabel(TaskKind.Meal))
        assertEquals("Sono", alertKindLabel(TaskKind.Sleep))
        assertEquals("Treino", alertKindLabel(TaskKind.Training))
        assertEquals("Tarefa", alertKindLabel(TaskKind.Common))
        assertEquals("Tarefa", alertKindLabel(TaskKind.Request))
    }

    @Test
    fun `the clock is the anchor in the device zone`() {
        assertEquals("14:30", alertClock(anchor, zone))
    }

    @Test
    fun `the anchor label says the day when it is not today`() {
        assertEquals("começa às", alertAnchorLabel(anchor.minus(Duration.ofMinutes(30)), anchor, zone, deadline = false))
        assertEquals("começa amanhã às", alertAnchorLabel(anchor.minus(Duration.ofDays(1)), anchor, zone, deadline = false))
        assertEquals("começa dia 14/09 às", alertAnchorLabel(anchor.minus(Duration.ofDays(3)), anchor, zone, deadline = false))
    }

    @Test
    fun `a long task counts to its deadline`() {
        assertEquals("prazo às", alertAnchorLabel(anchor.minus(Duration.ofMinutes(30)), anchor, zone, deadline = true))
        assertEquals("prazo amanhã às", alertAnchorLabel(anchor.minus(Duration.ofDays(1)), anchor, zone, deadline = true))
    }

    @Test
    fun `after the time the label is in the past`() {
        assertEquals("começou às", alertAnchorLabel(anchor, anchor, zone, deadline = false))
        assertEquals("prazo venceu às", alertAnchorLabel(anchor.plusSeconds(60), anchor, zone, deadline = true))
    }
}
