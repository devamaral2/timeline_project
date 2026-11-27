package app.braid.mobile.domain.reminder

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/** O feed do chat contra o que `notificationFeedOf` (web) devolveu, e os textos de tempo contra exemplos conhecidos. */
class NotificationFeedTest {
    private val cards: Map<String, TaskCard> =
        Fixtures
            .json("notifications-cases")
            .jsonObject
            .getValue("cards")
            .jsonArray
            .map { BraidJson.decodeFromJsonElement(TaskCardDto.serializer(), it).toDomain() }
            .associateBy { it.id }

    @Test
    fun `recent and upcoming match the web on every edge of the 24-hour history and the five-item limit`() {
        for (case in fixtureCases("notifications-cases", "feedOf")) {
            val sources = case.args[0].jsonArray.map { cards.getValue(it.jsonPrimitive.content) }
            val now = Instant.parse(case.string(1))

            val feed = notificationFeedOf(sources, now)

            val expected = case.result.jsonObject
            for (section in listOf("recent", "upcoming")) {
                val items = expected.getValue(section).jsonArray.map { it.jsonObject }
                val actual = if (section == "recent") feed.recent else feed.upcoming
                assertEquals(
                    "$section ${case.args}",
                    items.map { it.getValue("key").jsonPrimitive.content },
                    actual.map { it.key },
                )
                for ((item, reminder) in items.zip(actual)) {
                    assertEquals(item.getValue("sourceId").jsonPrimitive.content, reminder.taskId)
                    assertEquals(item.getValue("name").jsonPrimitive.content, reminder.name)
                    assertEquals(
                        item
                            .getValue("triggerAtMs")
                            .jsonPrimitive.content
                            .toLong(),
                        reminder.triggerAt.toEpochMilli(),
                    )
                    assertEquals(
                        item
                            .getValue("anchorMs")
                            .jsonPrimitive.content
                            .toLong(),
                        reminder.anchor.toEpochMilli(),
                    )
                }
            }
        }
    }

    private val now = Instant.parse("2026-09-14T15:00:00.000Z")

    @Test
    fun `a notice that fired reads as now, minutes ago or hours ago, rounding minutes and flooring hours`() {
        fun ago(minutes: Double) = relativeAgo(now, now.minusMillis((minutes * 60_000).toLong()))
        assertEquals("agora", ago(0.0))
        assertEquals("agora", ago(0.4))
        assertEquals("há 1 min", ago(0.5))
        assertEquals("há 59 min", ago(59.0))
        assertEquals("há 1 h", ago(60.0))
        assertEquals("há 1 h", ago(119.0))
        assertEquals("há 2 h", ago(120.0))
        assertEquals("há 24 h", ago(24 * 60.0))
    }

    @Test
    fun `an upcoming notice reads as today, tomorrow or the date, in the device zone`() {
        val zone = ZoneId.of("America/Sao_Paulo")

        // 12:00 em São Paulo.
        assertEquals("hoje às 14:00", upcomingAt(now, Instant.parse("2026-09-14T17:00:00Z"), zone))
        assertEquals("hoje às 23:59", upcomingAt(now, Instant.parse("2026-09-15T02:59:00Z"), zone))
        assertEquals("amanhã às 00:00", upcomingAt(now, Instant.parse("2026-09-15T03:00:00Z"), zone))
        assertEquals("amanhã às 09:45", upcomingAt(now, Instant.parse("2026-09-15T12:45:00Z"), zone))
        assertEquals("16/09 às 08:00", upcomingAt(now, Instant.parse("2026-09-16T11:00:00Z"), zone))
        assertEquals("05/10 às 09:05", upcomingAt(now, Instant.parse("2026-10-05T12:05:00Z"), zone))
    }

    @Test
    fun `the same instant reads differently in another zone`() {
        // 15:00Z já é 00:00 do dia 15 em Tóquio: 17:00Z é "hoje" às 02:00 lá, e 15:00Z do dia seguinte é "amanhã" às 00:00.
        val tokyo = ZoneId.of("Asia/Tokyo")
        assertEquals("hoje às 02:00", upcomingAt(now, Instant.parse("2026-09-14T17:00:00Z"), tokyo))
        assertEquals("amanhã às 00:00", upcomingAt(now, Instant.parse("2026-09-15T15:00:00Z"), tokyo))
    }
}
