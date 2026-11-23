package app.braid.mobile.domain.chat

import app.braid.mobile.domain.request.ModelOption
import org.junit.Assert.assertEquals
import org.junit.Test

class ModelSearchTest {
    private val models =
        listOf(
            ModelOption("google/gemini-4-neon", "Google: Gemini 4 Neon"),
            ModelOption("x-ai/grok-4.7", "SpaceXAI: Grok 4.7"),
            ModelOption("anthropic/claude-sonnet-5.5", "Anthropic: Claude Sonnet 5.5"),
            ModelOption("baidu/ernie-5.5", "Baidu: ERNIÊ 5.5"),
        )

    private fun names(query: String) = filterModels(models, query).map { it.name }

    @Test
    fun `the search matches the name or the id, every word, without accents or case`() {
        assertEquals(models.map { it.name }, names("  "))
        assertEquals(listOf("Anthropic: Claude Sonnet 5.5"), names("CLAUDE sonnet"))
        assertEquals(listOf("SpaceXAI: Grok 4.7"), names("x-ai"))
        assertEquals(listOf("Baidu: ERNIÊ 5.5"), names("ernie"))
        assertEquals(emptyList<String>(), names("claude grok"))
    }
}
