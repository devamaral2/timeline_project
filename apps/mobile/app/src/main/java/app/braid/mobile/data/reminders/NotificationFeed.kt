package app.braid.mobile.data.reminders

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class NotificationKind { Event, Task }

/** Um evento ou tarefa que pode avisar (`notify_offsets_minutes`). */
data class NotificationFeedSource(
    val kind: NotificationKind,
    val id: String,
    val name: String,
    val startedAt: Instant,
    val notifyOffsetsMinutes: List<Double>,
)

data class NotificationFeedItem(
    val key: String,
    val kind: NotificationKind,
    val sourceId: String,
    val name: String,
    val offsetMinutes: Double,
    val triggerAt: Instant,
    val startedAt: Instant,
)

data class NotificationFeed(
    val recent: List<NotificationFeedItem> = emptyList(),
    val upcoming: List<NotificationFeedItem> = emptyList(),
)

/** Quanto tempo atrás uma notificação ainda aparece na lista do sino. */
val NOTIFICATION_FEED_HISTORY: Duration = Duration.ofHours(24)
const val NOTIFICATION_FEED_UPCOMING_LIMIT = 5

/**
 * A lista do sino, derivada só de `notify_offsets_minutes`: o que venceu nas
 * últimas 24h (mais recente primeiro) e os próximos avisos (mais próximo
 * primeiro). É o mesmo cálculo de `notificationFeedOf` em
 * `apps/web/src/lib/notifications/due-notifications.ts`.
 */
fun notificationFeedOf(
    sources: List<NotificationFeedSource>,
    now: Instant,
): NotificationFeed {
    val items =
        sources.flatMap { source ->
            source.notifyOffsetsMinutes.map { offset ->
                NotificationFeedItem(
                    // `startedAt` entra na chave: remarcar recria o aviso.
                    key = "${source.kind}:${source.id}:${source.startedAt}:$offset",
                    kind = source.kind,
                    sourceId = source.id,
                    name = source.name,
                    offsetMinutes = offset,
                    triggerAt = source.startedAt.minusMillis((offset * 60_000).toLong()),
                    startedAt = source.startedAt,
                )
            }
        }
    val earliest = now.minus(NOTIFICATION_FEED_HISTORY)
    return NotificationFeed(
        recent =
            items
                .filter { !it.triggerAt.isAfter(now) && !it.triggerAt.isBefore(earliest) }
                .sortedByDescending(NotificationFeedItem::triggerAt),
        upcoming =
            items
                .filter { it.triggerAt.isAfter(now) }
                .sortedBy(NotificationFeedItem::triggerAt)
                .take(NOTIFICATION_FEED_UPCOMING_LIMIT),
    )
}

/** “5 minutos antes”, “1 dia antes”: o mesmo `notificationOffsetLabel` do web. */
fun notificationOffsetLabel(minutes: Double): String {
    val value = minutes.toInt()
    if (value % 1440 == 0) {
        val days = value / 1440
        return "$days ${if (days == 1) "dia" else "dias"} antes"
    }
    return "$value ${if (value == 1) "minuto" else "minutos"} antes"
}

/** “agora”, “há 12 min”, “há 3 h” para o que já venceu. */
fun notificationAgoLabel(
    triggerAt: Instant,
    now: Instant,
): String {
    val minutes = Duration.between(triggerAt, now).toMinutes().coerceAtLeast(0)
    return when {
        minutes < 1 -> "agora"
        minutes < 60 -> "há $minutes min"
        else -> "há ${minutes / 60} h"
    }
}

private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val dayFormatter = DateTimeFormatter.ofPattern("dd/MM")

/** “hoje às 14:05”, “amanhã às 09:00” ou “30/09 às 09:00” para o que ainda vai vencer. */
fun notificationUpcomingLabel(
    triggerAt: Instant,
    now: Instant,
    zone: ZoneId,
): String {
    val at = triggerAt.atZone(zone)
    val today = now.atZone(zone).toLocalDate()
    val time = timeFormatter.format(at)
    return when (at.toLocalDate()) {
        today -> "hoje às $time"
        today.plusDays(1) -> "amanhã às $time"
        else -> "${dayFormatter.format(at)} às $time"
    }
}
