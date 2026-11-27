package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.AgendaPageDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.support.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** `TaskCardDto.model` do contrato: o cartão de agente traz a escolha do pedido, e a linha só desenha o provedor com ela. */
class TaskCardModelTest {
    private val cards =
        BraidJson
            .decodeFromString(AgendaPageDto.serializer(), Fixtures.text("tasks-agent-model"))
            .items
            .map { it.toDomain() }
            .associateBy { it.id }

    @Test
    fun `a card with the request's model choice carries it`() {
        assertEquals(
            ModelSelection(ModelProvider.Anthropic, "claude-sonnet-5-5", ModelEffort.Medium),
            cards.getValue("model-anthropic").model,
        )
        assertEquals(ModelProvider.OpenAi, cards.getValue("model-openai").model?.provider)
        assertEquals(ModelProvider.OpenRouter, cards.getValue("model-openrouter").model?.provider)
    }

    @Test
    fun `a card without the choice has no model`() {
        assertNull(cards.getValue("model-none").model)
    }

    @Test
    fun `a card from before the field existed still reads`() {
        val cards = BraidJson.decodeFromString(AgendaPageDto.serializer(), Fixtures.text("tasks-agenda-page-1")).items.map { it.toDomain() }

        assertEquals(emptyList<TaskCard>(), cards.filter { it.model != null })
    }
}
