package app.braid.mobile.domain.timeline

import app.braid.mobile.data.dto.WorkoutSetDto
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.util.Locale

private val decimalFormat: NumberFormat =
    NumberFormat.getNumberInstance(Locale("pt", "BR")).apply { maximumFractionDigits = 1 }

/** "Segunda-feira, 14 de setembro"; ao atravessar a meia-noite, "Domingo, 13 → segunda, 14 de setembro". */
fun dateLineOf(
    startedAt: String,
    finishedAt: String?,
): String {
    val start = LocalDate.parse(dayKeyOf(startedAt))
    val end = LocalDate.parse(dayKeyOf(finishedAt ?: startedAt))
    val startName = weekday(start.toString())
    if (end == start) return "$startName, ${start.dayOfMonth} de ${months[start.monthValue - 1]}"
    if (end.monthValue == start.monthValue) {
        val from = startName.removeSuffix("-feira")
        val to = weekday(end.toString()).removeSuffix("-feira").lowercase()
        return "$from, ${start.dayOfMonth} → $to, ${end.dayOfMonth} de ${months[end.monthValue - 1]}"
    }
    return "${start.dayOfMonth} de ${months[start.monthValue - 1]} → ${end.dayOfMonth} de ${months[end.monthValue - 1]}"
}

/** "45 min", "1 h", "7 h 30". */
fun formatMinutes(total: Double): String {
    val minutes = Math.round(total).toInt().coerceAtLeast(0)
    if (minutes < 60) return "$minutes min"
    val rest = minutes % 60
    return if (rest == 0) "${minutes / 60} h" else "${minutes / 60} h $rest"
}

fun minutesBetween(
    startedAt: String,
    finishedAt: String,
): Int =
    ((Instant.parse(finishedAt).toEpochMilli() - Instant.parse(startedAt).toEpochMilli()) / 60_000)
        .toInt()
        .coerceAtLeast(0)

fun formatDecimal(value: Double): String = decimalFormat.format(value)

/** Ritmo em minutos decimais por km: 6.25 → "6′15″/km". */
fun formatPace(minutesPerKm: Double): String {
    var minutes = minutesPerKm.toInt()
    var seconds = Math.round((minutesPerKm - minutes) * 60).toInt()
    if (seconds == 60) {
        minutes += 1
        seconds = 0
    }
    return "$minutes′${seconds.toString().padStart(2, '0')}″/km"
}

fun pluralize(
    count: Int,
    singular: String,
    plural: String,
): String = "$count ${if (count == 1) singular else plural}"

/** Agrupa as séries por exercício, mantendo a ordem em que aparecem. */
fun groupSetsByExercise(sets: List<WorkoutSetDto>): List<Pair<String, List<WorkoutSetDto>>> = sets.groupBy { it.exercise }.toList()

data class DurationPart(
    val value: Int,
    val unit: String,
)

/** 30 min → [30 min]; 60 → [1 h]; 85 → [1 h, 25 min]. Os números grandes do cartão. */
fun durationPartsOf(
    startedAt: String,
    finishedAt: String,
): List<DurationPart> {
    val total = ((Instant.parse(finishedAt).toEpochMilli() - Instant.parse(startedAt).toEpochMilli()) / 60_000).toInt().coerceAtLeast(0)
    if (total < 60) return listOf(DurationPart(total, "min"))
    return buildList {
        add(DurationPart(total / 60, "h"))
        if (total % 60 != 0) add(DurationPart(total % 60, "min"))
    }
}
