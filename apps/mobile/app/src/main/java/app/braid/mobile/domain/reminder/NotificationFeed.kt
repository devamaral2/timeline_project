package app.braid.mobile.domain.reminder

import app.braid.mobile.domain.task.TaskCard
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/*
 * Port de `notificationFeedOf` (`apps/web/src/lib/notifications/due-notifications.ts`) e dos textos de tempo do feed
 * (`relativeAgo`, `upcomingAt`, em `notification-bell.tsx`). O feed deriva dos mesmos [Reminder] que agendam os alarmes
 * (ticket 22), então tela e notificação nunca discordam.
 */

/** Quantos avisos futuros o feed mostra. */
const val FEED_UPCOMING_LIMIT = 5

/** Quanto tempo atrás um aviso ainda aparece em "Recentes". */
val FEED_HISTORY: Duration = LOOK_BEHIND

/** Chaves lidas só valem enquanto a tarefa pode aparecer em "Recentes": o dobro da janela, como no web. */
val READ_RETENTION: Duration = FEED_HISTORY.multipliedBy(2)

/** [recent] do mais novo para o mais antigo; [upcoming] do mais próximo, no máximo [FEED_UPCOMING_LIMIT]. */
data class NotificationFeed(
    val recent: List<Reminder>,
    val upcoming: List<Reminder>,
)

/**
 * O que já venceu nas últimas 24 h (mesmo com a tarefa já começada: o aviso ainda é "recente") e os próximos avisos.
 * Quem chama entrega [now] no minuto, como o web.
 */
fun notificationFeedOf(
    cards: Collection<TaskCard>,
    now: Instant,
): NotificationFeed {
    val reminders = remindersOf(cards)
    val recent =
        reminders
            .filter { !it.triggerAt.isAfter(now) && Duration.between(it.triggerAt, now) <= FEED_HISTORY }
            .sortedByDescending { it.triggerAt }
    val upcoming = upcomingRemindersOf(cards, now, emptySet()).take(FEED_UPCOMING_LIMIT)
    return NotificationFeed(recent, upcoming)
}

/** Esquece as chaves lidas cuja tarefa passou há mais de 48 h. */
fun pruneRead(
    record: Map<String, Instant>,
    now: Instant,
): Map<String, Instant> = record.filterValues { !it.isBefore(now.minus(READ_RETENTION)) }

/** "agora", "há 5 min", "há 3 h": os minutos arredondam e as horas, não. */
fun relativeAgo(
    now: Instant,
    at: Instant,
): String {
    val minutes = maxOf(0L, Math.floorDiv(Duration.between(at, now).toMillis() + MILLIS_PER_MINUTE / 2, MILLIS_PER_MINUTE))
    return when {
        minutes < 1 -> "agora"
        minutes < MINUTES_PER_HOUR -> "há $minutes min"
        else -> "há ${minutes / MINUTES_PER_HOUR} h"
    }
}

private val CLOCK_FORMAT = DateTimeFormatter.ofPattern("HH:mm")
private val DAY_FORMAT = DateTimeFormatter.ofPattern("dd/MM")

/** "hoje às 14:00", "amanhã às 09:45" ou "16/09 às 08:00", no fuso do aparelho. */
fun upcomingAt(
    now: Instant,
    at: Instant,
    zone: ZoneId,
): String {
    val moment = at.atZone(zone)
    val time = CLOCK_FORMAT.format(moment)
    val day = moment.toLocalDate()
    return when (day) {
        now.atZone(zone).toLocalDate() -> "hoje às $time"
        now.plus(Duration.ofHours(24)).atZone(zone).toLocalDate() -> "amanhã às $time"
        else -> "${DAY_FORMAT.format(moment)} às $time"
    }
}

private const val MILLIS_PER_MINUTE = 60_000L
private const val MINUTES_PER_HOUR = 60L
