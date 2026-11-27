package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** As quatro gavetas da lista, conferidas contra `task-drawers.ts` do web rodando sobre os mesmos cartões. */
class TaskDrawersTest {
    private val fixture = Fixtures.json("task-list-drawers").jsonObject

    private fun cardsOf(element: JsonElement): List<TaskCard> =
        BraidJson.decodeFromJsonElement(ListSerializer(TaskCardDto.serializer()), element).map(TaskCardDto::toDomain)

    private fun strings(element: JsonElement) = element.jsonArray.map { it.jsonPrimitive.content }

    @Test
    fun `every case of the rule lands in the drawer the web gives it`() {
        val rule = fixture.getValue("rule").jsonObject
        val byId = cardsOf(rule.getValue("cards")).associateBy { it.id }
        val expected = rule.getValue("drawers").jsonArray.map { it.jsonObject }

        assertTrue(expected.size > 40)
        for (entry in expected) {
            val id = entry.getValue("id").jsonPrimitive.content
            val drawer =
                entry
                    .getValue("drawer")
                    .takeUnless { it is JsonNull }
                    ?.jsonPrimitive
                    ?.content
            assertEquals(id, drawer, drawerOf(byId.getValue(id))?.code)
        }
    }

    private fun assertScreen(
        label: String,
        screen: kotlinx.serialization.json.JsonObject,
        cards: List<TaskCard>,
    ) {
        val rows = listedCards(oneRowPerSeries(cards))
        val tree = nestSubtasks(rows)
        val drawers = drawersOf(tree.roots)

        assertEquals("$label rows", strings(screen.getValue("rowIds")), rows.map { it.id })
        assertEquals("$label roots", strings(screen.getValue("roots")), tree.roots.map { it.id })
        for ((id, ids) in screen.getValue("subtasks").jsonObject) {
            assertEquals("$label subtasks of $id", strings(ids), tree.subtasksOf(id).map { it.id })
        }
        val expected = screen.getValue("drawers").jsonArray.map { it.jsonObject }
        assertEquals("$label keys", expected.map { it.getValue("key").jsonPrimitive.content }, drawers.map { it.key.code })
        assertEquals("$label titles", expected.map { it.getValue("title").jsonPrimitive.content }, drawers.map { it.title })
        assertEquals(
            "$label collapsed",
            expected.map { it.getValue("collapsedByDefault").jsonPrimitive.boolean },
            drawers.map { it.collapsedByDefault },
        )
        assertEquals("$label ids", expected.map { strings(it.getValue("ids")) }, drawers.map { drawer -> drawer.cards.map { it.id } })
        val toNow = drawers.firstOrNull { it.key == TaskDrawerKey.Now }?.cards?.size ?: 0
        assertEquals("$label count", screen.getValue("toNow").jsonPrimitive.int, toNow)
        assertEquals("$label summary", screen.getValue("summary").jsonPrimitive.content, toNowLabel(toNow))
    }

    @Test
    fun `the list screen has the web's drawers, order and summary`() {
        val pipeline = fixture.getValue("pipeline").jsonObject
        assertScreen("pipeline", pipeline, cardsOf(pipeline.getValue("cards")))
    }

    @Test
    fun `a list with nothing for now says so and keeps the scheduled run`() {
        val empty = fixture.getValue("empty").jsonObject
        assertScreen("empty", empty, cardsOf(empty.getValue("cards")))
    }

    @Test
    fun `a new situation moves the agent task to the web's drawer`() {
        val cards = cardsOf(fixture.getValue("pipeline").jsonObject.getValue("cards"))
        for (case in fixture.getValue("situationChanges").jsonArray.map { it.jsonObject }) {
            val situation = TaskSituation.fromCode(case.getValue("situation").jsonPrimitive.content)
            val changed = cards.map { if (it.id == "ag-review") it.copy(situation = situation) else it }

            assertScreen("situation $situation", case, changed)
        }
    }

    @Test
    fun `a person comes before an agent in every drawer`() {
        val cards = cardsOf(fixture.getValue("pipeline").jsonObject.getValue("cards"))

        for (drawer in drawersOf(nestSubtasks(listedCards(cards)).roots)) {
            val actors = drawer.cards.map { it.actor }
            assertEquals(drawer.key.code, actors.sortedBy { it == TaskActor.Agent }, actors)
        }
    }

    @Test
    fun `in-progress agent work is not a row, but its person subtask still is`() {
        val cards = cardsOf(fixture.getValue("pipeline").jsonObject.getValue("cards"))
        val rows = listedCards(cards).map { it.id }

        assertTrue("ag-run" !in rows && "ag-queued" !in rows)
        assertTrue("pe-child-of-run" in nestSubtasks(listedCards(cards)).roots.map { it.id })
    }

    @Test
    fun `an unknown status stays in view instead of vanishing`() {
        val card = cardsOf(fixture.getValue("rule").jsonObject.getValue("cards")).first { it.id == "human-todo" }

        assertEquals(TaskDrawerKey.Now, drawerOf(card.copy(status = TaskStatus.Unknown)))
        assertEquals(TaskDrawerKey.Now, drawerOf(card.copy(actor = TaskActor.Agent, status = TaskStatus.Unknown)))
    }
}
