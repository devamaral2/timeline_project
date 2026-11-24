package app.braid.mobile.domain.chat

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.requests.ModelOptionsDto
import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOption
import app.braid.mobile.domain.request.ModelOptions
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** A folha da escolha do modelo: os favoritos, a busca e as linhas de cada aba contra o que as funções TS devolveram. */
class ModelFavoritesFixturesTest {
    private fun cases(function: String) = fixtureCases("model-favorites", function)

    private fun provider(code: String): ModelProvider = requireNotNull(ModelProvider.fromCodeOrNull(code))

    private fun options(name: String): ModelOptions {
        val element =
            Fixtures
                .json("model-favorites")
                .jsonObject
                .getValue("options")
                .jsonObject
                .getValue(name)
        return requireNotNull(BraidJson.decodeFromJsonElement(ModelOptionsDto.serializer(), element).toDomain())
    }

    private fun favorites(element: JsonElement): List<ModelFavorite> =
        element.jsonArray.map {
            val json = it.jsonObject
            ModelFavorite(provider(json.getValue("provider").jsonPrimitive.content), json.getValue("model").jsonPrimitive.content)
        }

    private fun selection(element: JsonElement): ModelSelection {
        val json = element.jsonObject
        return ModelSelection(
            provider(json.getValue("provider").jsonPrimitive.content),
            json.getValue("model").jsonPrimitive.content,
            ModelEffort.Medium,
        )
    }

    private fun tab(code: String): ModelTab = if (code == "favorites") ModelTab.Favorites else ModelTab.OfProvider(provider(code))

    private fun models(element: JsonElement): List<ModelOption> =
        element.jsonArray.map {
            ModelOption(
                it.jsonObject
                    .getValue("id")
                    .jsonPrimitive.content,
                it.jsonObject
                    .getValue("name")
                    .jsonPrimitive.content,
            )
        }

    @Test
    fun `a favorite is the pair of provider and model, as the web reads it`() {
        for (case in cases("isFavorite")) {
            assertEquals(
                case.toString(),
                case.result.jsonPrimitive.boolean,
                isFavorite(favorites(case.args[0]), provider(case.string(1)), case.string(2)),
            )
        }
    }

    @Test
    fun `toggling adds at the end or takes out, as the web does`() {
        for (case in cases("toggleFavorite")) {
            assertEquals(
                case.toString(),
                favorites(case.result),
                toggleFavorite(favorites(case.args[0]), provider(case.string(1)), case.string(2)),
            )
        }
    }

    @Test
    fun `the search matches every word in the name or the id, without accents or case`() {
        for (case in cases("filterModels")) {
            assertEquals(case.toString(), models(case.result), filterModels(models(case.args[0]), case.string(1)))
        }
    }

    @Test
    fun `the rows of each tab are the web rows`() {
        for (case in cases("modelRows")) {
            val expected =
                case.result.jsonArray.map {
                    val json = it.jsonObject
                    ModelRow(
                        provider = provider(json.getValue("provider").jsonPrimitive.content),
                        id = json.getValue("id").jsonPrimitive.content,
                        name = json.getValue("name").jsonPrimitive.content,
                        favorite = json.getValue("favorite").jsonPrimitive.boolean,
                        selected = json.getValue("selected").jsonPrimitive.boolean,
                    )
                }
            val actual =
                modelRows(options(case.string(0)), favorites(case.args[1]), selection(case.args[2]), tab(case.string(3)), case.string(4))
            assertEquals(case.toString(), expected, actual)
        }
    }
}
