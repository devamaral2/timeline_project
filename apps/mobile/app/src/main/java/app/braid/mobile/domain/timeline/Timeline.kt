package app.braid.mobile.domain.timeline

import app.braid.mobile.data.dto.TimelineEventCardDto
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

const val TIMELINE_TIME_ZONE: String = "America/Sao_Paulo"

private val timelineZone: ZoneId = ZoneId.of(TIMELINE_TIME_ZONE)
private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm").withZone(timelineZone)
private val months =
    listOf(
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
    )
private val monthTitles = months.map { month -> month.replaceFirstChar { it.uppercase() } }
private val weekdays =
    listOf(
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
    )

data class TimelineDay(
    val dayKey: String,
    val isToday: Boolean,
    val events: List<TimelineEventCardDto>,
)

data class TimelinePageState(
    val items: List<TimelineEventCardDto>,
    val nextCursor: String? = null,
)

enum class EventPosition {
    Upcoming,
    Running,
    Past,
}

fun dayKeyOf(instant: String): String =
    Instant
        .parse(instant)
        .atZone(timelineZone)
        .toLocalDate()
        .toString()

fun zonedDayStart(dayKey: String): Instant = LocalDate.parse(dayKey).atStartOfDay(timelineZone).toInstant()

fun zonedDayEnd(dayKey: String): Instant =
    LocalDate
        .parse(dayKey)
        .plusDays(1)
        .atStartOfDay(timelineZone)
        .toInstant()
        .minusMillis(1)

fun shiftDayKey(
    dayKey: String,
    days: Long,
): String = LocalDate.parse(dayKey).plusDays(days).toString()

fun weekdayIndexOf(dayKey: String): Int = LocalDate.parse(dayKey).dayOfWeek.value % 7

fun weekOf(dayKey: String): List<String> {
    val sunday = LocalDate.parse(dayKey).minusDays(weekdayIndexOf(dayKey).toLong())
    return (0..6).map { sunday.plusDays(it.toLong()).toString() }
}

fun dayKeyRange(
    startKey: String,
    count: Int,
): List<String> = (0 until count.coerceAtLeast(0)).map { shiftDayKey(startKey, it.toLong()) }

fun weekday(dayKey: String): String = weekdays[LocalDate.parse(dayKey).dayOfWeek.value % 7]

fun weekdayInitial(dayKey: String): String = weekday(dayKey).take(1)

fun dayNumber(dayKey: String): String = LocalDate.parse(dayKey).dayOfMonth.toString()

fun mediumDate(dayKey: String): String {
    val date = LocalDate.parse(dayKey)
    return "${date.dayOfMonth} de ${months[date.monthValue - 1]}, ${weekday(dayKey).lowercase()}"
}

fun relativeDayLabel(
    dayKey: String,
    todayKey: String,
): String =
    when (dayKey) {
        todayKey -> "Hoje"
        shiftDayKey(todayKey, -1) -> "Ontem"
        shiftDayKey(todayKey, 1) -> "Amanhã"
        else -> weekday(dayKey)
    }

fun monthLabel(dayKey: String): String {
    val date = LocalDate.parse(dayKey)
    return "${monthTitles[date.monthValue - 1]} de ${date.year}"
}

fun isSameMonth(
    dayKey: String,
    other: String,
): Boolean = dayKey.take(7) == other.take(7)

fun shiftMonthKey(
    dayKey: String,
    delta: Long,
): String {
    val date = LocalDate.parse(dayKey)
    val target = date.plusMonths(delta)
    return target.withDayOfMonth(minOf(date.dayOfMonth, target.lengthOfMonth())).toString()
}

fun monthGridOf(dayKey: String): List<String> {
    val first = LocalDate.parse(dayKey).withDayOfMonth(1)
    val start = first.minusDays(weekdayIndexOf(first.toString()).toLong())
    return (0 until 42).map { start.plusDays(it.toLong()).toString() }
}

fun formatTime(instant: String): String = timeFormatter.format(Instant.parse(instant))

fun elapsedSecondsOf(
    startedAt: String,
    now: Instant = Instant.now(),
): Long = ((now.toEpochMilli() - Instant.parse(startedAt).toEpochMilli()) / 1_000).coerceAtLeast(0)

fun formatStopwatch(totalSeconds: Long): String {
    val safe = totalSeconds.coerceAtLeast(0)
    val hours = safe / 3_600
    val minutes = (safe % 3_600) / 60
    val seconds = safe % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%02d:%02d".format(minutes, seconds)
    }
}

fun endLabelOf(
    event: TimelineEventCardDto,
    now: Instant = Instant.now(),
): String = endLabelOf(event.startedAt, event.finishedAt, now)

fun endLabelOf(
    startedAt: String,
    finishedAt: String?,
    now: Instant = Instant.now(),
): String =
    finishedAt?.let(::formatTime)
        ?: if (now.isBefore(Instant.parse(startedAt))) "sem hora de fim" else "em andamento"

fun eventPositionOf(
    event: TimelineEventCardDto,
    now: Instant = Instant.now(),
): EventPosition {
    val started = Instant.parse(event.startedAt)
    if (now.isBefore(started)) return EventPosition.Upcoming
    val finished = event.finishedAt?.let(Instant::parse) ?: return EventPosition.Running
    return if (finished <= now) EventPosition.Past else EventPosition.Running
}

fun durationMinutesOf(event: TimelineEventCardDto): Int? {
    val finished = event.finishedAt?.let(Instant::parse) ?: return null
    return ((finished.toEpochMilli() - Instant.parse(event.startedAt).toEpochMilli()) / 60_000).toInt()
}

fun trackedMinutesOf(events: List<TimelineEventCardDto>): Int = events.sumOf { durationMinutesOf(it) ?: 0 }

fun longestDurationOf(events: List<TimelineEventCardDto>): Int = events.maxOfOrNull { durationMinutesOf(it) ?: 0 } ?: 0

fun durationRatioOf(
    event: TimelineEventCardDto,
    longestMinutes: Int,
): Float? {
    val duration = durationMinutesOf(event) ?: return null
    if (longestMinutes <= 0) return 0.06f
    return (duration.toFloat() / longestMinutes).coerceIn(0.06f, 1f)
}

fun mergeTimelinePage(
    current: List<TimelineEventCardDto>,
    page: app.braid.mobile.data.dto.TimelineEventPageDto,
): TimelinePageState {
    val seen = current.mapTo(mutableSetOf()) { it.id }
    val merged = current.toMutableList()
    page.items.forEach { event ->
        if (seen.add(event.id)) merged += event
    }
    return TimelinePageState(merged, page.nextCursor)
}

fun groupEventsByDay(
    events: List<TimelineEventCardDto>,
    todayKey: String,
): List<TimelineDay> {
    val uniqueEvents = events.distinctBy { it.id }
    return uniqueEvents
        .groupBy { event -> dayKeyOf(event.startedAt) }
        .toList()
        .sortedByDescending { it.first }
        .map { (dayKey, dayEvents) ->
            TimelineDay(
                dayKey = dayKey,
                isToday = dayKey == todayKey,
                events = dayEvents.sortedByDescending { it.startedAt },
            )
        }
}
