package app.braid.mobile.domain.time

const val MINUTES_PER_HOUR = 60
const val HOURS_PER_DAY = 24

/** Uma duração em horas inteiras e os minutos que sobram. */
data class HoursAndMinutes(
    val hours: Int,
    val minutes: Int,
)

fun hoursAndMinutes(totalMinutes: Int): HoursAndMinutes = HoursAndMinutes(totalMinutes / MINUTES_PER_HOUR, totalMinutes % MINUTES_PER_HOUR)

/**
 * "agora", "há 12 min", "há 2 h" e, com [withDays], "há 3 dias": a tabela do tempo decorrido. O cartão da tarefa
 * (`elapsedLabel`) diz os dias e o feed de avisos (`relativeAgo`) não, e cada um arredonda os minutos do seu jeito.
 */
fun agoLabel(
    minutes: Long,
    withDays: Boolean,
): String {
    if (minutes < 1) return "agora"
    if (minutes < MINUTES_PER_HOUR) return "há $minutes min"
    val hours = minutes / MINUTES_PER_HOUR
    if (!withDays || hours < HOURS_PER_DAY) return "há $hours h"
    val days = hours / HOURS_PER_DAY
    return if (days == 1L) "há 1 dia" else "há $days dias"
}
