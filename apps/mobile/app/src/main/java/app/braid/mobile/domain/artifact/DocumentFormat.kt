package app.braid.mobile.domain.artifact

import app.braid.mobile.domain.time.MINUTES_PER_HOUR
import app.braid.mobile.domain.time.MONTHS_ABBREVIATED
import app.braid.mobile.domain.time.MONTHS_LONG
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.daysBetween
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.domain.timeline.weekday
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.util.Locale
import kotlin.math.floor

/*
 * As regras de texto dos artefatos, portadas de `lib/notes/notes-model.ts`,
 * `lib/tasks/task-detail-format.ts` e `macroShares` (NoteBody.tsx). Cada saída é
 * conferida contra fixtures geradas pelas funções TS.
 */

private fun dayAndMonth(dayKey: String): Pair<Int, Int> {
    val (_, month, day) = dayKey.split("-").map(String::toInt)
    return day to month
}

/** "11 set." e o ano, quando ele não é o corrente. */
private fun shortDay(
    instant: Instant,
    now: Instant,
): String {
    val key = dayKeyOf(instant)
    val (day, month) = dayAndMonth(key)
    val sameYear = key.take(YEAR_DIGITS) == dayKeyOf(now).take(YEAR_DIGITS)
    return "$day ${MONTHS_ABBREVIATED[month - 1]}${if (sameYear) "" else " ${key.take(YEAR_DIGITS)}"}"
}

private const val YEAR_DIGITS = 4

/** "hoje, 09:00", "ontem, 21:12", "amanhã, 08:00" ou "11 set., 09:00". */
fun whenLabel(
    instant: Instant,
    now: Instant,
): String {
    val age = daysBetween(dayKeyOf(instant), dayKeyOf(now))
    val time = formatTime(instant)
    return when (age) {
        0 -> "hoje, $time"
        1 -> "ontem, $time"
        -1 -> "amanhã, $time"
        else -> "${shortDay(instant, now)}, $time"
    }
}

/** "Segunda-feira, 14 de setembro", ou "Domingo, 13 → segunda, 14 de setembro" quando atravessa a meia-noite. */
fun dateLineOf(
    startedAt: Instant,
    finishedAt: Instant? = null,
): String {
    val startKey = dayKeyOf(startedAt)
    val (startDay, startMonth) = dayAndMonth(startKey)
    val endKey = finishedAt?.let(::dayKeyOf) ?: startKey
    if (endKey == startKey) return "${weekday(startKey)}, $startDay de ${MONTHS_LONG[startMonth - 1]}"
    val (endDay, endMonth) = dayAndMonth(endKey)
    if (endMonth == startMonth) {
        val first = weekday(startKey).replace("-feira", "")
        val second = weekday(endKey).replace("-feira", "").lowercase()
        return "$first, $startDay → $second, $endDay de ${MONTHS_LONG[endMonth - 1]}"
    }
    return "$startDay de ${MONTHS_LONG[startMonth - 1]} → $endDay de ${MONTHS_LONG[endMonth - 1]}"
}

/** "45 min", "1 h", "7 h 30". */
fun formatMinutes(total: Double): String {
    val minutes = roundHalfUp(total).coerceAtLeast(0)
    if (minutes < MINUTES_PER_HOUR) return "$minutes min"
    val rest = minutes % MINUTES_PER_HOUR
    return "${minutes / MINUTES_PER_HOUR} h${if (rest != 0) " $rest" else ""}"
}

fun formatMinutes(total: Int): String = formatMinutes(total.toDouble())

/** `Math.round` do JavaScript: a metade sobe. */
private fun roundHalfUp(value: Double): Int = floor(value + 0.5).toInt()

private val brazilianSymbols = DecimalFormatSymbols(Locale.forLanguageTag("pt-BR"))

/** Um decimal em pt-BR com no máximo uma casa; a metade se afasta do zero, como o `Intl.NumberFormat` do web. */
fun formatDecimal(value: Double): String {
    // O valor mais curto que identifica o double (o que o ICU usa), não o binário exato: 1,15 vira 1,2.
    val rounded = BigDecimal(value.toString()).setScale(1, RoundingMode.HALF_UP)
    return DecimalFormat("#,##0.#", brazilianSymbols).format(rounded)
}

/** Ritmo em minutos decimais por quilômetro: 6.25 vira "6′15″/km". */
fun formatPace(minutesPerKm: Double): String {
    var minutes = floor(minutesPerKm).toInt()
    var seconds = roundHalfUp((minutesPerKm - minutes) * SECONDS_PER_MINUTE)
    if (seconds == SECONDS_PER_MINUTE) {
        minutes += 1
        seconds = 0
    }
    return "$minutes′${seconds.toString().padStart(2, '0')}″/km"
}

private const val SECONDS_PER_MINUTE = 60

fun pluralize(
    count: Int,
    singular: String,
    plural: String,
): String = "$count ${if (count == 1) singular else plural}"

/** As séries de um exercício, na ordem em que o exercício aparece. */
data class ExerciseSets(
    val exercise: String,
    val sets: List<WorkoutSet>,
)

fun groupSetsByExercise(sets: List<WorkoutSet>): List<ExerciseSets> =
    sets
        .groupBy {
            it.exercise
        }.map { (exercise, grouped) -> ExerciseSets(exercise, grouped) }

private const val KCAL_PER_GRAM_PROTEIN_OR_CARBOHYDRATE = 4
private const val KCAL_PER_GRAM_FAT = 9
private const val PERCENT = 100

/** Quanto cada macro pesa nas calorias (proteína e carboidrato 4 kcal/g, gordura 9): proteínas, carboidratos, gorduras, em %. */
fun macroShares(totals: FoodTotals): Triple<Int, Int, Int> {
    val protein = totals.proteinGrams * KCAL_PER_GRAM_PROTEIN_OR_CARBOHYDRATE
    val carbohydrate = totals.carbohydrateGrams * KCAL_PER_GRAM_PROTEIN_OR_CARBOHYDRATE
    val fat = totals.fatGrams * KCAL_PER_GRAM_FAT
    val sum = protein + carbohydrate + fat
    if (sum <= 0) return Triple(0, 0, 0)

    fun share(value: Double) = (value / sum * PERCENT).let(::roundHalfUp)
    return Triple(share(protein), share(carbohydrate), share(fat))
}
