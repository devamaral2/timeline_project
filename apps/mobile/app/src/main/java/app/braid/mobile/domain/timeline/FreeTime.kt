package app.braid.mobile.domain.timeline

import app.braid.mobile.data.dto.TimelineEventCardDto
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Uma lacuna entre eventos do mesmo dia. Só existe na tela (como o
 * `free-time.ts` do web); nada disso é salvo nem vem da API.
 */
data class FreeTimeSlot(
    val start: Instant,
    val end: Instant,
    /** Minutos inteiros da lacuna (sempre ≥ 1). */
    val minutes: Int,
    /** A lacuna vai até o fim do dia, que se escreve “24:00”. */
    val endsAtMidnight: Boolean,
)

/** Eventos e tempo livre na ordem do relógio, como a agenda os desenha. */
sealed interface AgendaEntry {
    val key: String

    data class Event(
        val event: TimelineEventCardDto,
    ) : AgendaEntry {
        override val key get() = "e:${event.id}"
    }

    data class FreeTime(
        val slot: FreeTimeSlot,
    ) : AgendaEntry {
        override val key get() = "free:${slot.start.toEpochMilli()}"
    }
}

/**
 * Os intervalos livres de um dia: entre um evento e o seguinte e do fim do
 * último evento até a meia-noite. Nunca atravessam o dia e não há lacuna antes
 * do primeiro evento.
 *
 * Eventos sobrepostos contam como um bloco só (vale o fim mais tardio). Um
 * evento sem hora de fim não diz quando termina, então dali em diante não se
 * calcula tempo livre: seria chute.
 */
fun freeTimeSlotsOf(
    events: List<TimelineEventCardDto>,
    dayKey: String,
): List<FreeTimeSlot> {
    val dayEnd =
        LocalDate
            .parse(dayKey)
            .plusDays(1)
            .atStartOfDay(ZoneId.of(TIMELINE_TIME_ZONE))
            .toInstant()
    val slots = mutableListOf<FreeTimeSlot>()
    var cursor: Instant? = null

    for (event in events.sortedBy { Instant.parse(it.startedAt) }) {
        val start = Instant.parse(event.startedAt)
        val current = cursor
        if (current != null && start.isAfter(current)) slots.addSlot(current, minOf(start, dayEnd), dayEnd)
        val end = event.finishedAt?.let(Instant::parse) ?: return slots
        cursor = if (current == null || end.isAfter(current)) end else current
    }

    val last = cursor
    if (last != null && last.isBefore(dayEnd)) slots.addSlot(last, dayEnd, dayEnd)
    return slots
}

private fun MutableList<FreeTimeSlot>.addSlot(
    start: Instant,
    end: Instant,
    dayEnd: Instant,
) {
    val minutes = Math.round((end.toEpochMilli() - start.toEpochMilli()) / 60_000.0).toInt()
    if (minutes >= 1) add(FreeTimeSlot(start, end, minutes, endsAtMidnight = end == dayEnd))
}

/** Intercala os eventos do dia e o tempo livre entre eles, em ordem cronológica. */
fun agendaEntriesOf(
    events: List<TimelineEventCardDto>,
    dayKey: String,
): List<AgendaEntry> {
    val entries =
        events.map { AgendaEntry.Event(it) } +
            freeTimeSlotsOf(events, dayKey).map { AgendaEntry.FreeTime(it) }
    return entries.sortedBy { entry ->
        when (entry) {
            is AgendaEntry.Event -> Instant.parse(entry.event.startedAt)
            is AgendaEntry.FreeTime -> entry.slot.start
        }
    }
}
