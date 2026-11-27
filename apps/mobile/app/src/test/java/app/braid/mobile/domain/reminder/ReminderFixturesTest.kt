package app.braid.mobile.domain.reminder

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** O cálculo dos lembretes contra o que as funções de `due-notifications.ts` devolveram para as mesmas tarefas. */
class ReminderFixturesTest {
    private val cards: Map<String, TaskCard> =
        Fixtures
            .json("notifications-cases")
            .jsonObject
            .getValue("cards")
            .jsonArray
            .map { BraidJson.decodeFromJsonElement(TaskCardDto.serializer(), it).toDomain() }
            .associateBy { it.id }

    private fun card(id: String) = cards.getValue(id)

    @Test
    fun `the catch-up window is the one the web uses`() {
        val web =
            Fixtures
                .json("notifications-cases")
                .jsonObject
                .getValue("catchUpWindowMs")
                .jsonPrimitive.content
                .toLong()
        assertEquals(web, CATCH_UP_WINDOW.toMillis())
    }

    @Test
    fun `the anchor is the start, the deadline of a long task, and nothing once done or cancelled`() {
        for (case in fixtureCases("notifications-cases", "anchorOf")) {
            val expected =
                case.result
                    .takeUnless { it is JsonNull }
                    ?.jsonPrimitive
                    ?.content
                    ?.let(Instant::parse)
            assertEquals("${case.args}", expected, reminderAnchorOf(card(case.string(0))))
        }
    }

    @Test
    fun `the key carries the task, the anchor and the offset`() {
        for (case in fixtureCases("notifications-cases", "keyOf")) {
            assertEquals("${case.args}", case.resultString, reminderKeyOf(card(case.string(0)), case.int(1)))
        }
    }

    @Test
    fun `tracked means a status or a long task, the rest is reference`() {
        for (case in fixtureCases("notifications-cases", "kindOf")) {
            val expected = if (case.resultString == "tracked") ReminderKind.Tracked else ReminderKind.Reference
            assertEquals("${case.args}", expected, reminderKindOf(card(case.string(0))))
        }
    }

    @Test
    fun `the offset label uses days for whole days`() {
        for (case in fixtureCases("notifications-cases", "offsetLabel")) {
            assertEquals("${case.args}", case.resultString, offsetLabel(case.int(0)))
        }
    }

    @Test
    fun `what is due and what is settled match the web on every edge of the one-hour window`() {
        for (case in fixtureCases("notifications-cases", "dueNotificationsOf")) {
            val sources = case.args[0].jsonArray.map { card(it.jsonPrimitive.content) }
            val now = Instant.parse(case.string(1))
            val fired =
                case.args[2]
                    .jsonArray
                    .map { it.jsonPrimitive.content }
                    .toSet()

            val actual = dueRemindersOf(sources, now, fired)

            val expected = case.result.jsonObject
            val expectedDue = expected.getValue("due").jsonArray.map { it.jsonObject }
            assertEquals(
                "due ${case.args}",
                expectedDue.map { it.getValue("key").jsonPrimitive.content },
                actual.due.map { it.key },
            )
            for ((expectedItem, item) in expectedDue.zip(actual.due)) {
                assertEquals(expectedItem.getValue("sourceId").jsonPrimitive.content, item.taskId)
                assertEquals(expectedItem.getValue("name").jsonPrimitive.content, item.name)
                assertEquals(
                    expectedItem
                        .getValue("offsetMinutes")
                        .jsonPrimitive.content
                        .toInt(),
                    item.offsetMinutes,
                )
                val kind =
                    if (expectedItem.getValue("kind").jsonPrimitive.content ==
                        "tracked"
                    ) {
                        ReminderKind.Tracked
                    } else {
                        ReminderKind.Reference
                    }
                assertEquals(kind, item.kind)
            }
            val expectedSettled = expected.getValue("settled").jsonArray.map { it.jsonObject }
            assertEquals(
                "settled ${case.args}",
                expectedSettled.map {
                    it.getValue("key").jsonPrimitive.content to
                        it
                            .getValue("anchorMs")
                            .jsonPrimitive.content
                            .toLong()
                },
                actual.settled.map { it.key to it.anchor.toEpochMilli() },
            )
        }
    }

    @Test
    fun `upcoming reminders are exactly the ones the due calculation leaves for later, nearest first`() {
        val sources = cards.values.toList()
        for (case in fixtureCases("notifications-cases", "dueNotificationsOf")) {
            val now = Instant.parse(case.string(1))
            val fired =
                case.args[2]
                    .jsonArray
                    .map { it.jsonPrimitive.content }
                    .toSet()
            val upcoming = upcomingRemindersOf(sources, now, fired)

            val settledKeys =
                case.result.jsonObject
                    .getValue(
                        "settled",
                    ).jsonArray
                    .map {
                        it.jsonObject
                            .getValue("key")
                            .jsonPrimitive.content
                    }.toSet()
            val everyKey = remindersOf(sources).map { it.key }.toSet()
            assertEquals("${case.args}", everyKey - settledKeys - fired, upcoming.map { it.key }.toSet())
            assertEquals(upcoming.sortedBy { it.triggerAt }, upcoming)
        }
    }
}
