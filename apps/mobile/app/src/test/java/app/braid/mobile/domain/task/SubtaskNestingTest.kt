package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** A hierarquia da lista, conferida contra `nestSubtasks` do web rodando sobre a mesma lista em várias ordens. */
class SubtaskNestingTest {
    private val fixture = Fixtures.json("task-list-nesting").jsonObject
    private val now = Instant.parse(fixture.getValue("now").jsonPrimitive.content)
    private val cards =
        BraidJson
            .decodeFromJsonElement(ListSerializer(TaskCardDto.serializer()), fixture.getValue("cards"))
            .map(TaskCardDto::toDomain)
    private val byId = cards.associateBy { it.id }

    private fun strings(element: JsonElement) = element.jsonArray.map { it.jsonPrimitive.content }

    @Test
    fun `the tree is the web's in the server order and in shuffled, reversed and trimmed orders`() {
        val cases = fixture.getValue("cases").jsonArray.map { it.jsonObject }
        for (case in cases) {
            val order = strings(case.getValue("order"))
            val tree = nestSubtasks(order.map { byId.getValue(it) })

            assertEquals("roots of $order", strings(case.getValue("roots")), tree.roots.map { it.id })
            for ((id, expected) in case.getValue("subtasks").jsonObject) {
                assertEquals("subtasks of $id in $order", strings(expected), tree.subtasksOf(id).map { it.id })
            }
        }
    }

    @Test
    fun `a cycle, a chain that ends in a cycle and a task that is its own parent hide nobody`() {
        val tree = nestSubtasks(cards)
        val roots = tree.roots.map { it.id }

        for (id in listOf("cyc-a", "cyc-b", "cyc-tail", "self", "orphan")) {
            assertEquals("$id stays a row", true, id in roots)
        }
        // Nenhum cartão some: cada um é linha ou está na gaveta de alguém.
        val nested = cards.flatMap { tree.subtasksOf(it.id) }.map { it.id }
        assertEquals(cards.map { it.id }.toSet(), (roots + nested).toSet())
        assertEquals(cards.size, roots.size + nested.size)
    }

    @Test
    fun `a subtask of a subtask goes inside its direct parent, not its grandparent`() {
        val tree = nestSubtasks(cards)

        assertEquals(listOf("sub-1", "sub-2", "sub-3", "sub-7"), tree.subtasksOf("trip").map { it.id }.sorted())
        assertEquals(listOf("sub-4"), tree.subtasksOf("sub-2").map { it.id })
        assertEquals(listOf("sub-5", "sub-8"), tree.subtasksOf("sub-4").map { it.id })
    }

    @Test
    fun `groups are made of the rows alone, as the web does`() {
        val groups = groupTrackedTasks(nestSubtasks(oneRowPerSeries(cards)).roots)
        val expected = fixture.getValue("groups").jsonArray.map { it.jsonObject }

        val keys = groups.map { it.key.name.replaceFirstChar(Char::lowercase) }
        assertEquals(expected.map { it.getValue("key").jsonPrimitive.content }, keys)
        assertEquals(expected.map { strings(it.getValue("ids")) }, groups.map { group -> group.cards.map { it.id } })
    }

    @Test
    fun `the when and the overdue tone of a drawer line are the web's`() {
        for (entry in fixture.getValue("drawer").jsonArray) {
            val expected = entry.jsonObject
            val id = expected.getValue("id").jsonPrimitive.content
            val card = byId.getValue(id)

            assertEquals("$id when", expected.getValue("when").jsonPrimitive.content, cardWhenLabel(card, now))
            assertEquals("$id overdue", expected.getValue("overdue").jsonPrimitive.boolean, cardIsOverdue(card, now))
        }
    }
}
