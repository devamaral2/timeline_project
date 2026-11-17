package app.braid.mobile.core.designsystem

import androidx.compose.ui.graphics.Color
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A paleta do Kotlin contra os tokens de `packages/theme`: o gerador de fixtures lê os tokens do pacote (e o `--faint`
 * escuro do `globals.css`) e escreve cada cor em ARGB. Se alguém muda o pacote sem rodar `generate:theme`, ou o
 * gerador esquece um token, este teste falha com o nome dele.
 */
class ThemeTokensFixtureTest {
    private val fixture = Fixtures.json("theme-tokens").jsonObject

    private fun palette(mode: String): JsonObject = fixture.getValue(mode).jsonObject

    private fun argb(literal: String): Color = Color(literal.removePrefix("0x").toLong(16).toInt())

    private fun checkColors(
        mode: String,
        actual: Map<String, Color>,
    ) {
        val expected = palette(mode).getValue("colors").jsonObject
        assertTrue("O fixture de $mode não traz cores", expected.isNotEmpty())
        for ((name, literal) in expected) {
            val color = actual[name]
            assertTrue("O token $mode/$name existe em packages/theme mas não no Color.kt: rode generate:theme", color != null)
            assertEquals("$mode/$name", argb(literal.jsonPrimitive.content), color)
        }
        assertEquals("Tokens a mais no Color.kt de $mode", expected.keys, actual.keys)
    }

    @Test
    fun `every dark token of the package is in the Kotlin palette with the same color`() = checkColors("dark", DarkTokens.byName)

    @Test
    fun `every light token of the package is in the Kotlin palette with the same color`() = checkColors("light", LightTokens.byName)

    @Test
    fun `the tag lightness and chroma match`() {
        for ((mode, lightness, chroma) in listOf(
            Triple("dark", DarkTokens.tagLightness, DarkTokens.tagChroma),
            Triple("light", LightTokens.tagLightness, LightTokens.tagChroma),
        )) {
            assertEquals(palette(mode).getValue("tagLightness").jsonPrimitive.doubleOrNull!!, lightness.toDouble(), 1e-6)
            assertEquals(palette(mode).getValue("tagChroma").jsonPrimitive.doubleOrNull!!, chroma.toDouble(), 1e-6)
        }
    }

    @Test
    fun `the document faint color is the generated token, not a hand-written value`() {
        assertEquals(DarkTokens.faint, documentTokensFor(dark = true).faint)
        assertEquals(LightTokens.faint, documentTokensFor(dark = false).faint)
    }
}
