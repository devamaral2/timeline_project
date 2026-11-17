package app.braid.mobile.ui.agenda

import app.braid.mobile.domain.agenda.FreeSlot
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.domain.timeline.monthLabel
import java.time.Instant

/** "Setembro" no ano corrente; "Setembro de 2027" quando se navega para outro ano (`monthName` do web). */
fun monthName(
    dayKey: String,
    todayKey: String,
): String = if (dayKey.take(4) == todayKey.take(4)) monthLabel(dayKey).replace(Regex(" de \\d{4}$"), "") else monthLabel(dayKey)

/** "Maio 2026", o título do seletor aberto. */
fun pickerMonthTitle(dayKey: String): String = monthLabel(dayKey).replace(" de ", " ")

/** A hora em que a janela livre começa ("21:00"). */
fun freeStartLabel(slot: FreeSlot): String = formatTime(Instant.ofEpochMilli(slot.startMs))

/** A hora em que a janela livre termina; a que vai até o fim do dia termina em "24:00". */
fun freeEndLabel(slot: FreeSlot): String = if (slot.endsAtMidnight) "24:00" else formatTime(Instant.ofEpochMilli(slot.endMs))

/** "21:00 — 24:00", a faixa que a linha da janela livre escreve. */
fun freeRangeLabel(slot: FreeSlot): String = "${freeStartLabel(slot)} — ${freeEndLabel(slot)}"

private const val MINUTES_PER_HOUR = 60

/** A duração da janela livre: "2h 30min", "1h", "15min". */
fun freeDurationLabel(minutes: Int): String {
    val hours = minutes / MINUTES_PER_HOUR
    val rest = minutes % MINUTES_PER_HOUR
    return when {
        hours == 0 -> "${rest}min"
        rest == 0 -> "${hours}h"
        else -> "${hours}h ${rest}min"
    }
}
