package app.braid.mobile.ui.chat

import app.braid.mobile.data.dto.AgentChatFieldChangeDto
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class EntityChangeFormatTest {
    private val utc = ZoneId.of("UTC")

    @Test
    fun aMovedEventShowsTheOldTimeAsRemovedAndTheNewOneAsAdded() {
        val lines =
            changeLines(
                listOf(
                    AgentChatFieldChangeDto(
                        field = "time",
                        before = "2026-09-15T07:00:00.000Z/2026-09-15T07:45:00.000Z",
                        after = "2026-09-15T18:00:00.000Z/2026-09-15T18:45:00.000Z",
                    ),
                ),
                utc,
            )
        assertEquals(
            listOf(
                ChangeLine('-', "", "ter 15 set 07:00 — 07:45"),
                ChangeLine('+', "", "ter 15 set 18:00 — 18:45"),
            ),
            lines,
        )
    }

    @Test
    fun anEndOnAnotherDayCarriesItsDayAndAnOpenEndShowsOnlyTheStart() {
        val moved =
            changeLines(
                listOf(AgentChatFieldChangeDto("time", after = "2026-09-15T23:00:00.000Z/2026-09-16T00:30:00.000Z")),
                utc,
            )
        assertEquals("ter 15 set 23:00 — qua 16 set 00:30", moved.single().value)
        val open = changeLines(listOf(AgentChatFieldChangeDto("time", after = "2026-09-15T07:00:00.000Z/")), utc)
        assertEquals("ter 15 set 07:00", open.single().value)
    }

    @Test
    fun textFieldsKeepTheirLabel() {
        val lines = changeLines(listOf(AgentChatFieldChangeDto("priority", before = "Normal", after = "Urgente")), utc)
        assertEquals(listOf(ChangeLine('-', "prioridade", "Normal"), ChangeLine('+', "prioridade", "Urgente")), lines)
    }
}
