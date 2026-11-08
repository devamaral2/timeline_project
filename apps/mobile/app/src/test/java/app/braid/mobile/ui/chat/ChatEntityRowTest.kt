package app.braid.mobile.ui.chat

import app.braid.mobile.data.dto.AgentChatEntityRefDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChatEntityRowTest {
    private fun entity(
        kind: String,
        change: String,
        label: String? = null,
    ) = AgentChatEntityRefDto(kind = kind, id = "01ID", change = change, label = label)

    @Test
    fun eventsAndNotesOpenTheirScreen() {
        assertEquals(ChatEntityTarget.Event("01ID"), entity("event", "updated").openTarget())
        assertEquals(ChatEntityTarget.Note("01ID"), entity("note", "created").openTarget())
    }

    @Test
    fun deletedRecordsAndTasksStayAsText() {
        assertNull(entity("event", "deleted").openTarget())
        assertNull(entity("task", "created").openTarget())
    }

    @Test
    fun theTextAgreesWithTheNounLikeTheWeb() {
        assertEquals("Tarefa criada · Limpar a casa", entityChipText(entity("task", "created", "Limpar a casa")))
        assertEquals("Evento alterado · Treino", entityChipText(entity("event", "updated", "Treino")))
        assertEquals("Nota apagada", entityChipText(entity("note", "deleted")))
    }

    @Test
    fun processEntitiesBecomeTheSameRowsAsTheChat() {
        val created = app.braid.mobile.data.dto.AiProcessEntityDto(kind = "task", id = "t1", name = "Comprar faixa elástica", operation = "create")
        val updated = app.braid.mobile.data.dto.AiProcessEntityDto(kind = "event", id = "e1", name = "Treino de mobilidade", operation = "update")
        assertEquals("Tarefa criada · Comprar faixa elástica", entityChipText(created.toChatRef()))
        assertEquals("Evento alterado · Treino de mobilidade", entityChipText(updated.toChatRef()))
        assertEquals(ChatEntityTarget.Event("e1"), updated.toChatRef().openTarget())
    }
}
