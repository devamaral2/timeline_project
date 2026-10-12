package app.braid.mobile.data.reminders

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class NotificationFeedTest {
    private val now = Instant.parse("2026-09-16T12:00:00Z")

    private fun source(
        id: String,
        startsInMinutes: Long,
        offsets: List<Double> = listOf(5.0),
        kind: NotificationKind = NotificationKind.Event,
    ) = NotificationFeedSource(
        kind = kind,
        id = id,
        name = id.uppercase(),
        startedAt = now.plusSeconds(startsInMinutes * 60),
        notifyOffsetsMinutes = offsets,
    )

    @Test
    fun listsRecentNewestFirstAndNextUpcomingFirst() {
        val feed =
            notificationFeedOf(
                listOf(
                    source("a", startsInMinutes = 3), // venceu há 2 min
                    source("b", startsInMinutes = 10, offsets = listOf(15.0)), // venceu há 5 min
                    source("c", startsInMinutes = 60), // vence em 55 min
                    source("d", startsInMinutes = 30, kind = NotificationKind.Task), // vence em 25 min
                    source("old", startsInMinutes = -2000), // venceu há mais de 24h
                ),
                now,
            )

        assertEquals(listOf("A", "B"), feed.recent.map { it.name })
        assertEquals(listOf("D", "C"), feed.upcoming.map { it.name })
        assertEquals(NotificationKind.Task, feed.upcoming.first().kind)
    }

    @Test
    fun capsUpcomingAtFive() {
        val feed = notificationFeedOf((1..8).map { source("e$it", startsInMinutes = 10L + it) }, now)
        assertEquals(NOTIFICATION_FEED_UPCOMING_LIMIT, feed.upcoming.size)
    }

    @Test
    fun reschedulingAnEventCreatesANewKey() {
        val first = notificationFeedOf(listOf(source("a", startsInMinutes = 10)), now).upcoming.single().key
        val moved = notificationFeedOf(listOf(source("a", startsInMinutes = 20)), now).upcoming.single().key
        assert(first != moved)
    }

    @Test
    fun labelsOffsetsLikeTheWeb() {
        assertEquals("1 minuto antes", notificationOffsetLabel(1.0))
        assertEquals("5 minutos antes", notificationOffsetLabel(5.0))
        assertEquals("1 dia antes", notificationOffsetLabel(1440.0))
        assertEquals("2 dias antes", notificationOffsetLabel(2880.0))
    }

    @Test
    fun labelsWhenNotificationsFire() {
        val zone = ZoneId.of("America/Sao_Paulo")
        assertEquals("agora", notificationAgoLabel(now, now))
        assertEquals("há 12 min", notificationAgoLabel(now.minusSeconds(12 * 60), now))
        assertEquals("há 3 h", notificationAgoLabel(now.minusSeconds(3 * 3600), now))
        assertEquals("hoje às 10:30", notificationUpcomingLabel(Instant.parse("2026-09-16T13:30:00Z"), now, zone))
        assertEquals("amanhã às 09:00", notificationUpcomingLabel(Instant.parse("2026-09-17T12:00:00Z"), now, zone))
        assertEquals("30/09 às 09:00", notificationUpcomingLabel(Instant.parse("2026-09-30T12:00:00Z"), now, zone))
    }
}
