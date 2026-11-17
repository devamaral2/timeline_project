package app.braid.mobile.domain.task

import app.braid.mobile.domain.time.MINUTES_PER_HOUR
import app.braid.mobile.domain.time.WEEKDAYS_SHORT
import app.braid.mobile.domain.time.agoLabel
import app.braid.mobile.domain.time.hoursAndMinutes
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.domain.timeline.relativeDayLabel
import app.braid.mobile.domain.timeline.shiftDayKey
import app.braid.mobile.domain.timeline.shortDate
import app.braid.mobile.domain.timeline.zonedDayStart
import java.time.Instant
import java.util.Locale

/*
 * Port de `apps/web/src/lib/tasks/card-text.ts`: os textos que a linha da lista
 * calcula do cartão e do instante atual. São funções puras, conferidas contra as
 * fixtures geradas pelas funções TS (`CardTextTest`).
 */

private const val MINUTE_MS = 60_000L

/** Status de pessoa que ainda pede ação. */
private val OPEN_HUMAN_STATUSES = setOf(TaskStatus.Todo, TaskStatus.Doing, TaskStatus.InHold, TaskStatus.ToDefine)

/**
 * O quando da linha: "Hoje, 09:00", "Era ontem", "Sem data", "Prazo 30 nov", "na fila · há 3 min"... Com
 * [ruleInPlaceOfTime], a ocorrência que segue uma série mostra a regra dela no lugar do horário ("Todo dia, 18:00").
 */
fun cardWhenLabel(
    card: TaskCard,
    now: Instant,
    ruleInPlaceOfTime: Boolean = false,
): String {
    val recurrence = card.recurrence
    if (ruleInPlaceOfTime && recurrence != null && !recurrence.detached) return recurrenceRuleLabel(recurrence.rule)
    if (card.actor == TaskActor.Agent) return agentWhenLabel(card, now)
    if (card.longRunning) {
        return card.estimatedFinishAt?.let { "Prazo ${dayMonthLabel(dayKeyOf(it))}" } ?: "Sem data"
    }
    val startedAt = card.startedAt ?: return "Sem data"
    return dayWhenLabel(startedAt, card.status, now)
}

/** Atrasado: a fazer com o dia já passado, ou tarefa longa aberta com o prazo vencido. Tarefa de agente não atrasa. */
fun cardIsOverdue(
    card: TaskCard,
    now: Instant,
): Boolean {
    if (card.actor == TaskActor.Agent) return false
    val todayKey = dayKeyOf(now)
    if (card.longRunning) {
        val deadline = card.estimatedFinishAt ?: return false
        return card.status != null && card.status in OPEN_HUMAN_STATUSES && dayKeyOf(deadline) < todayKey
    }
    val startedAt = card.startedAt ?: return false
    return card.status == TaskStatus.Todo && dayKeyOf(startedAt) < todayKey
}

/** A duração, fim planejado menos início: "50 min", "1h30", "2h". Sem os dois instantes, na tarefa longa e no dia sem hora, não há. */
fun cardDurationLabel(card: TaskCard): String? {
    val startedAt = card.startedAt
    val finish = card.estimatedFinishAt
    if (card.longRunning || startedAt == null || finish == null) return null
    if (isDayStart(startedAt)) return null
    val minutes = Math.round((finish.toEpochMilli() - startedAt.toEpochMilli()).toDouble() / MINUTE_MS)
    if (minutes <= 0) return null
    if (minutes < MINUTES_PER_HOUR) return "$minutes min"
    val (hours, rest) = hoursAndMinutes(minutes.toInt())
    return if (rest != 0) "${hours}h${rest.toString().padStart(2, '0')}" else "${hours}h"
}

/** "há 12 min", "há 2 h", "há 3 dias"; menos de um minuto, "agora". */
fun elapsedLabel(
    instant: Instant,
    now: Instant,
): String {
    val minutes = maxOf(0L, Math.floorDiv(now.toEpochMilli() - instant.toEpochMilli(), MINUTE_MS))
    return agoLabel(minutes, withDays = true)
}

private val PORTUGUESE_BRAZIL = Locale.forLanguageTag("pt-BR")

/** A regra da série em texto: "Todo dia, 18:00", "Seg, qua e sex, 18:30". */
fun recurrenceRuleLabel(rule: RecurrenceRule): String =
    "${ruleDaysLabel(rule)}, ${rule.timeOfDay}".replaceFirstChar { it.uppercase(PORTUGUESE_BRAZIL) }

private fun ruleDaysLabel(rule: RecurrenceRule): String {
    val every = rule.interval
    return when (rule.frequency) {
        RecurrenceFrequency.Daily -> if (every == 1) "todo dia" else "a cada $every dias"
        RecurrenceFrequency.Weekly -> {
            val days = weekdayList(rule.byWeekday ?: 0)
            if (every == 1) days else "a cada $every semanas, $days"
        }
        RecurrenceFrequency.Monthly -> {
            val day = rule.byMonthDay?.toString().orEmpty()
            if (every == 1) "todo dia $day" else "a cada $every meses, dia $day"
        }
        RecurrenceFrequency.Yearly -> "todo ano, ${rule.byMonthDay?.toString().orEmpty()}/${rule.byMonth?.toString().orEmpty()}"
    }
}

/** Os dias da máscara (bit 0 = domingo): "seg, qua e sex". */
private fun weekdayList(mask: Int): String {
    val names = WEEKDAYS_SHORT.filterIndexed { index, _ -> mask and (1 shl index) != 0 }
    if (names.size <= 1) return names.firstOrNull().orEmpty()
    return "${names.dropLast(1).joinToString(", ")} e ${names.last()}"
}

private fun agentWhenLabel(
    card: TaskCard,
    now: Instant,
): String {
    if (card.status == TaskStatus.Waiting) return "aguarda sua resposta"
    val startedAt = card.startedAt
    if (card.status == TaskStatus.Queued) {
        return if (startedAt != null) "na fila · ${elapsedLabel(startedAt, now)}" else "na fila"
    }
    return if (startedAt != null) elapsedLabel(startedAt, now) else "Sem data"
}

private fun dayWhenLabel(
    startedAt: Instant,
    status: TaskStatus?,
    now: Instant,
): String {
    val dayKey = dayKeyOf(startedAt)
    val todayKey = dayKeyOf(now)
    if (status == TaskStatus.Todo && dayKey < todayKey) {
        return if (dayKey == shiftDayKey(todayKey, -1)) "Era ontem" else "Era ${dayMonthLabel(dayKey)}"
    }
    val isNearToday = dayKey in listOf(shiftDayKey(todayKey, -1), todayKey, shiftDayKey(todayKey, 1))
    val day = if (isNearToday) relativeDayLabel(dayKey, todayKey) else dayMonthLabel(dayKey)
    return if (isDayStart(startedAt)) day else "$day, ${formatTime(startedAt)}"
}

/** "30 nov": a data curta da timeline, em minúsculas. */
private fun dayMonthLabel(dayKey: String): String = shortDate(dayKey).lowercase()

/** O início à meia-noite local é o "dia sem hora": sem horário e sem duração. */
private fun isDayStart(instant: Instant): Boolean = instant == zonedDayStart(dayKeyOf(instant))
