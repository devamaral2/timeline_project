package app.braid.mobile.domain.request

import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** O alvo da barra de edição por IA conferido contra o `entity-edit-target.ts` e o `meal-generation.ts` do web. */
class EntityEditModelTest {
    private val model = Fixtures.json("entity-edit-model").jsonObject

    @Test
    fun `every entity type sends the code the API accepts and names its target as the web does`() {
        val targets = (model.getValue("targets") as JsonArray).map { it.jsonObject }
        assertEquals(targets.size, EditEntityType.entries.size)
        for (case in targets) {
            val code = case.getValue("type").jsonPrimitive.content
            val type = EditEntityType.entries.single { it.code == code }
            assertEquals(code, case.getValue("label").jsonPrimitive.content, type.target)
        }
    }

    @Test
    fun `the type a document sends follows the web, and the global ones, routers and exercises have no bar`() {
        for (case in (model.getValue("artifacts") as JsonArray).map { it.jsonObject }) {
            val type = ArtifactType.fromCode(case.getValue("type").jsonPrimitive.content)
            val global = case.getValue("global").jsonPrimitive.boolean
            val expected =
                case
                    .getValue(
                        "entityType",
                    ).let { if (it is kotlinx.serialization.json.JsonNull) null else it.jsonPrimitive.content }
            assertEquals("$type global=$global", expected, editEntityTypeOfArtifact(type, global)?.code)
        }
    }

    @Test
    fun `the texts glue the target into the placeholder and the labels`() {
        assertEquals("Peça uma mudança nesta tarefa", editPlaceholder(EditEntityType.Task))
        assertEquals("Peça uma mudança neste treino", editPlaceholder(EditEntityType.Training))
        assertEquals("Editar esta nota com IA", editSectionLabel(EditEntityType.Text))
        assertEquals("Pedir à IA para editar esta refeição", editFieldLabel(EditEntityType.Food))
        assertEquals(
            model.getValue("pendingMealMessage").jsonPrimitive.content.let {
                "Aguarde a geração da refeição para editar a nota."
            },
            PENDING_MEAL_EDIT_TEXT,
        )
    }
}
