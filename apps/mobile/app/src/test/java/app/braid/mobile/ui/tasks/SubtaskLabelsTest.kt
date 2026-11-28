package app.braid.mobile.ui.tasks

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.domain.task.nestSubtasks
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/** Os textos da gaveta que o leitor de tela e a linha mostram, sobre a lista da fixture. */
class SubtaskLabelsTest {
    private val fixture = Fixtures.json("task-list-nesting").jsonObject
    private val now = Instant.parse(fixture.getValue("now").jsonPrimitive.content)
    private val cards =
        BraidJson
            .decodeFromJsonElement(ListSerializer(TaskCardDto.serializer()), fixture.getValue("cards"))
            .map(TaskCardDto::toDomain)
    private val tree = nestSubtasks(cards)
    private val byId = cards.associateBy { it.id }

    @Test
    fun `the fraction counts the direct subtasks that are done`() {
        val trip = tree.subtasksOf("trip")

        assertEquals(1, subtasksDone(trip))
        assertEquals("Subtarefas de “Planejar viagem”: 1 de 4 feitas", subtaskToggleLabel("Planejar viagem", trip))
        assertEquals("Subtarefas de “Planejar viagem”", subtaskDrawerLabel("Planejar viagem"))
        // Só as diretas: a "Pagar o quarto" (feita) está dentro da "Escolher quarto", não conta para a principal.
        assertEquals(0, subtasksDone(tree.subtasksOf("sub-2")))
        assertEquals(1, subtasksDone(tree.subtasksOf("sub-4")))
    }

    @Test
    fun `the top of the thread says how many are done, in the singular when there is only one`() {
        assertEquals("1 de 4 feitas", subtaskProgressText(tree.subtasksOf("trip")))
        assertEquals("1 de 2 feitas", subtaskProgressText(tree.subtasksOf("sub-4")))
        assertEquals("0 de 1 feita", subtaskProgressText(listOf(byId.getValue("sub-2"))))
    }

    @Test
    fun `the glyph of a person subtask says the status and what the tap does`() {
        assertEquals("A fazer. Mudar status de “Comprar passagens”", subtaskGlyphLabel(byId.getValue("sub-2")))
        assertEquals("Sem data. Mudar status de “Sem dia ainda”", subtaskGlyphLabel(byId.getValue("sub-7")))
    }

    @Test
    fun `the drawer hides a when that would only say no date`() {
        assertNull(subtaskWhenLabel(byId.getValue("sub-7"), now))
        assertNull(subtaskWhenLabel(byId.getValue("sub-5"), now))
        assertEquals(true, subtaskWhenLabel(byId.getValue("sub-2"), now) != null)
    }
}
