package app.braid.mobile.ui.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChatCommandsTest {
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
}
