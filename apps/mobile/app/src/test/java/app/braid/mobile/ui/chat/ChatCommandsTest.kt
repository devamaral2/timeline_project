package app.braid.mobile.ui.chat

import app.braid.mobile.data.dto.AgentConversationDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class ChatCommandsTest {
    private val zone = ZoneId.of("America/Sao_Paulo")
    private val today = LocalDate.of(2026, 10, 18)

    @Test
    fun `a slash alone offers every command and the typed prefix narrows them`() {
        assertEquals(ChatCommand.entries.toList(), parseChatCommand("/")?.matches)
        assertEquals(listOf(ChatCommand.Event), parseChatCommand("/ev")?.matches)
        assertEquals(listOf(ChatCommand.Search), parseChatCommand("/pesq")?.matches)
    }

    @Test
    fun `the text after a known command is its argument`() {
        assertEquals(
            CommandQuery(listOf(ChatCommand.Note), "ideias para a proposta"),
            parseChatCommand("/nota  ideias para a proposta "),
        )
    }

    @Test
    fun `text without a slash or with an unknown command goes to the AI`() {
        assertNull(parseChatCommand("crie uma tarefa"))
        assertNull(parseChatCommand("/ev amanhã"))
        assertNull(parseChatCommand("/xyz"))
    }

    private fun conversation(
        id: String,
        lastMessageAt: String,
    ) = AgentConversationDto(
        id = id,
        preview = id,
        lastMessageAt = lastMessageAt,
        revision = 1,
        createdAt = lastMessageAt,
        updatedAt = lastMessageAt,
    )

    @Test
    fun `conversations are grouped by today, the last seven days and the rest, newest first`() {
        val groups =
            groupConversations(
                listOf(
                    conversation("old", "2026-09-28T12:00:00Z"),
                    conversation("morning", "2026-10-18T12:10:00Z"),
                    conversation("tuesday", "2026-10-13T23:00:00Z"),
                    conversation("afternoon", "2026-10-18T17:32:00Z"),
                ),
                today,
                zone,
            )

        assertEquals(
            listOf(
                ConversationGroupLabel.Today to listOf("afternoon", "morning"),
                ConversationGroupLabel.ThisWeek to listOf("tuesday"),
                ConversationGroupLabel.Before to listOf("old"),
            ),
            groups.map { group -> group.label to group.items.map { it.id } },
        )
    }

    @Test
    fun `the time reads as the hour today, the weekday this week and the date before`() {
        assertEquals("14:32", conversationTime("2026-10-18T17:32:00Z", today, zone))
        assertEquals("ter.", conversationTime("2026-10-13T23:00:00Z", today, zone))
        assertEquals("28 set.", conversationTime("2026-09-28T12:00:00Z", today, zone))
    }
}
