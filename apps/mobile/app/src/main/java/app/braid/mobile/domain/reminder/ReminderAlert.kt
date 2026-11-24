package app.braid.mobile.domain.reminder

import app.braid.mobile.domain.task.TaskKind
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/*
 * Os textos da tela cheia do lembrete (o "Cartaz"): o tipo, o horário de referência e quanto falta para ele. Só o
 * Android tem essa tela (o web não acende a tela do aparelho), então não há função TS de que isto seja port.
 */

/** Quanto falta para o horário de referência, já no número e na unidade que a tela escreve grande. */
data class RemainingTime(
    val amount: Long,
    /** "minuto", "minutos", "hora", "horas", "dia" ou "dias", concordando com [amount]. */
    val unit: String,
) {
    /** "Falta" para um, "Faltam" para o resto: o rótulo acima do número. */
    val lead: String get() = if (amount == 1L) "Falta" else "Faltam"
}

/**
 * Quanto falta de [now] até [anchor]: minutos até 2 h, horas até 1 dia, dias daí em diante. Os minutos arredondam para
 * cima (o alarme que chega segundos atrasado ainda diz "30 minutos"); horas e dias, para o mais próximo. `null` quando
 * o horário já chegou.
 */
fun remainingTimeOf(
    anchor: Instant,
    now: Instant,
): RemainingTime? {
    val millis = Duration.between(now, anchor).toMillis()
    if (millis <= 0) return null
    val minutes = Math.floorDiv(millis + MILLIS_PER_MINUTE - 1, MILLIS_PER_MINUTE)
    return when {
        minutes < MINUTES_UNTIL_HOURS -> RemainingTime(minutes, if (minutes == 1L) "minuto" else "minutos")
        minutes < MINUTES_PER_DAY -> rounded(minutes, MINUTES_PER_HOUR).let { RemainingTime(it, if (it == 1L) "hora" else "horas") }
        else -> rounded(minutes, MINUTES_PER_DAY).let { RemainingTime(it, if (it == 1L) "dia" else "dias") }
    }
}

/** O tipo da tarefa como a tela o escreve; o que não é refeição, sono nem treino é "Tarefa", como na notificação. */
fun alertKindLabel(kind: TaskKind): String =
    when (kind) {
        TaskKind.Meal -> "Refeição"
        TaskKind.Sleep -> "Sono"
        TaskKind.Training -> "Treino"
        else -> "Tarefa"
    }

private val CLOCK_FORMAT = DateTimeFormatter.ofPattern("HH:mm")
private val DAY_FORMAT = DateTimeFormatter.ofPattern("dd/MM")

/** "14:30": o horário de referência no fuso do aparelho, o número maior da tela. */
fun alertClock(
    anchor: Instant,
    zone: ZoneId,
): String = CLOCK_FORMAT.format(anchor.atZone(zone))

/**
 * O que vem antes do horário: "começa às", "começa amanhã às", "começa dia 16/09 às"; na tarefa longa ([deadline]) o
 * horário é o prazo, então "prazo às". Depois que o horário chega, "começou às" ou "prazo venceu às".
 */
fun alertAnchorLabel(
    now: Instant,
    anchor: Instant,
    zone: ZoneId,
    deadline: Boolean,
): String {
    if (!now.isBefore(anchor)) return if (deadline) "prazo venceu às" else "começou às"
    val subject = if (deadline) "prazo" else "começa"
    val day = anchor.atZone(zone).toLocalDate()
    val today = now.atZone(zone).toLocalDate()
    return when (day) {
        today -> "$subject às"
        today.plusDays(1) -> "$subject amanhã às"
        else -> "$subject dia ${DAY_FORMAT.format(day)} às"
    }
}

private fun rounded(
    minutes: Long,
    per: Long,
): Long = Math.floorDiv(minutes + per / 2, per)

private const val MILLIS_PER_MINUTE = 60_000L
private const val MINUTES_PER_HOUR = 60L
private const val MINUTES_PER_DAY = 1440L
private const val MINUTES_UNTIL_HOURS = 120L
