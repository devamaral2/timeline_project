package app.braid.mobile.core.designsystem

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import app.braid.mobile.domain.project.Project
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A marca do projeto de `packages/theme` (`project-mark.ts`), conferida contra o fixture gerado da função do web. */
class ProjectMarkTest {
    @Test
    fun `the initials are the ones the web gives, in every case of the fixture`() {
        val cases = fixtureCases("project-marks", "projectInitials")
        assertEquals(18, cases.size)
        for (case in cases) {
            assertEquals("iniciais de ${case.string(0)}", case.resultString, projectInitials(case.string(0)))
        }
    }

    @Test
    fun `the colours are the ones the web gives in both schemes`() {
        val fixture = Fixtures.json("project-marks").jsonObject
        for ((scheme, dark) in listOf("light" to false, "dark" to true)) {
            for (entry in fixture.getValue(scheme) as JsonArray) {
                val expected = entry.jsonObject
                val name = expected.getValue("name").jsonPrimitive.content
                val personal =
                    expected
                        .getValue("personal")
                        .jsonPrimitive.content
                        .toBoolean()
                val mark = projectMarkColors(Project("id", name, personal), dark)
                val label = "$scheme $name"
                assertEquals(label, expected.getValue("initials").jsonPrimitive.content, projectInitials(name))
                assertEquals(label, expected.getValue("background").jsonPrimitive.content, hex(mark.background))
                assertEquals(label, expected.getValue("text").jsonPrimitive.content, hex(mark.text))
                if (personal) {
                    assertEquals(label, expected.getValue("outline").jsonPrimitive.content, hex(checkNotNull(mark.outline)))
                } else {
                    assertNull(label, mark.outline)
                    assertEquals(
                        label,
                        expected
                            .getValue("hue")
                            .jsonPrimitive.content
                            .toInt(),
                        hueForTag(name),
                    )
                }
            }
        }
    }

    private fun hex(color: Color): String = "#%06x".format(color.toArgb() and 0xFFFFFF)
}
