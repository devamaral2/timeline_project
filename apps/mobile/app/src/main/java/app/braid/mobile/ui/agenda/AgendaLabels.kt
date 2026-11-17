package app.braid.mobile.ui.agenda

import app.braid.mobile.domain.timeline.monthLabel

/** "Setembro" no ano corrente; "Setembro de 2027" quando se navega para outro ano (`monthName` do web). */
fun monthName(
    dayKey: String,
    todayKey: String,
): String = if (dayKey.take(4) == todayKey.take(4)) monthLabel(dayKey).replace(Regex(" de \\d{4}$"), "") else monthLabel(dayKey)

/** "Maio 2026", o título do seletor aberto. */
fun pickerMonthTitle(dayKey: String): String = monthLabel(dayKey).replace(" de ", " ")
