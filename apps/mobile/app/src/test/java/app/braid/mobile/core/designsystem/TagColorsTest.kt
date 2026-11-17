package app.braid.mobile.core.designsystem

import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** `hueForTag` e as cores de tag de `packages/theme`, conferidas contra as funções TS. */
class TagColorsTest {
    @Test
    fun `the hue of a tag is the same hash the web uses`() {
        for (case in fixtureCases("tag-colors", "hueForTag")) {
            assertEquals("tag ${case.args}", case.resultInt, hueForTag(case.string(0)))
        }
    }

    @Test
    fun `tag colors match the theme in both schemes`() {
        val fixture = Fixtures.json("tag-colors").jsonObject
        for ((scheme, lightness, chroma) in listOf(
            Triple("light", LightTokens.tagLightness, LightTokens.tagChroma),
            Triple("dark", DarkTokens.tagLightness, DarkTokens.tagChroma),
        )) {
            for (entry in fixture.getValue(scheme) as JsonArray) {
                val tag = entry.jsonObject
                val name = tag.getValue("name").jsonPrimitive.content
                val expected = tag.getValue("color").jsonPrimitive.content
                assertEquals("$scheme $name", expected, "#%06x".format(tagRgb(name, lightness, chroma)))
                // O fundo do chip é a mesma cor com alfa 0,14.
                val background = tag.getValue("backgroundColor").jsonPrimitive.content
                assertEquals(
                    "$scheme $name background",
                    "rgba(${(tagRgb(name, lightness, chroma) shr 16) and 0xFF}, ${(tagRgb(name, lightness, chroma) shr 8) and 0xFF}, " +
                        "${tagRgb(name, lightness, chroma) and 0xFF}, 0.14)",
                    background,
                )
            }
        }
    }
}
