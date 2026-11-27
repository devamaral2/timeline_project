package app.braid.mobile.ui.tasks

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.domain.task.TASK_SITUATIONS
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** As três situações: a ordem do menu, o nome que o leitor de tela anuncia e a leitura que tolera um código novo. */
class TaskSituationTest {
    @Test
    fun `the menu order and the names are the web ones`() {
        val web = Fixtures.json("task-situation-names").jsonArray.map { it.jsonObject }

        assertEquals(web.map { it.getValue("situation").jsonPrimitive.content }, TASK_SITUATIONS.map { it.code })
        assertEquals(web.map { it.getValue("name").jsonPrimitive.content }, TASK_SITUATIONS.map(::situationName))
        assertEquals(listOf("Para revisar", "Revisada", "Guardada"), TASK_SITUATIONS.map(::situationName))
    }

    @Test
    fun `the cards read their situation, and a card without one reads as none`() {
        val cards = Fixtures.json("task-list-situations").jsonArray.map { BraidJson.decodeFromJsonElement(TaskCardDto.serializer(), it).toDomain() }

        assertEquals(
            mapOf(
                "sit-person" to null,
                "sit-review" to TaskSituation.ToReview,
                "sit-reviewed" to TaskSituation.Reviewed,
                "sit-bookmarked" to TaskSituation.Bookmarked,
                "sit-waiting" to null,
                "sit-cron" to null,
                "sit-running" to null,
                "sit-legacy" to null,
            ),
            cards.associate { it.id to it.situation },
        )
    }

    @Test
    fun `an unknown situation code reads as unknown and does not break the card`() {
        val card =
            Fixtures
                .json("task-list-situations")
                .jsonArray[1]
                .jsonObject

        val read = BraidJson.decodeFromJsonElement(TaskCardDto.serializer(), JsonObject(card + ("situation" to JsonPrimitive("archived")))).toDomain()

        assertEquals(TaskSituation.Unknown, read.situation)
        assertEquals("Situação", situationName(TaskSituation.Unknown))
        assertNull(TaskSituation.fromCode(null))
    }
}
