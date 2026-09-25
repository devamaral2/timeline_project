package app.braid.mobile.data

import androidx.compose.ui.graphics.Color
import app.braid.mobile.core.designsystem.hueForTag
import app.braid.mobile.core.designsystem.tagColors
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TagColorsParityTest {
    private val json = Json { ignoreUnknownKeys = false }

    @Test
    fun hueAndColorsMatchGeneratedTypeScriptOutputs() {
        val fixture = json.parseToJsonElement(resource("tag-colors-parity")).jsonArray
        fixture.forEach { entry ->
            val item = entry.jsonObject
            val name = item.getValue("name").jsonPrimitive.content
            assertEquals(item.getValue("hue").jsonPrimitive.int, hueForTag(name))
            assertColor(
                item
                    .getValue("light")
                    .jsonObject
                    .getValue("color")
                    .jsonPrimitive.content,
                tagColors(name, darkTheme = false).color,
            )
            assertColor(
                item
                    .getValue("dark")
                    .jsonObject
                    .getValue("color")
                    .jsonPrimitive.content,
                tagColors(name).color,
            )
            assertTrue(tagColors(name).backgroundColor.alpha in 0.13f..0.15f)
        }
    }

    private fun assertColor(
        expected: String,
        actual: Color,
    ) {
        val hex = expected.removePrefix("#")
        assertEquals(hex.substring(0, 2).toInt(16), (actual.red * 255).toInt())
        assertEquals(hex.substring(2, 4).toInt(16), (actual.green * 255).toInt())
        assertEquals(hex.substring(4, 6).toInt(16), (actual.blue * 255).toInt())
    }

    private fun resource(name: String): String = javaClass.classLoader!!.getResource("fixtures/$name.json")!!.readText()
}
