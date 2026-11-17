package app.braid.mobile.domain.agentfile

import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** O texto da vista do arquivo do agente, conferido contra as saídas das funções do web (`agent-file-model.json`). */
class AgentFileTextTest {
    private val model = Fixtures.json("agent-file-model").jsonObject

    private fun cases(name: String): List<JsonObject> = model.getValue(name).jsonArray.map { it.jsonObject }

    private fun JsonElement.text(): String = jsonPrimitive.content

    private fun JsonElement.textOrNull(): String? = if (this is JsonNull) null else text()

    @Test
    fun `the --- header becomes a summary and the rest is the markdown body`() {
        for (case in cases("frontmatter")) {
            val text = case.getValue("text").text()
            val file = splitFrontmatter(text)
            val expected = case.getValue("summary").jsonArray.map { it.jsonObject }
            assertEquals("text: $text", expected.size, file.summary.size)
            expected.zip(file.summary).forEach { (line, actual) ->
                assertEquals(line.getValue("key").textOrNull(), actual.key)
                assertEquals(line.getValue("value").textOrNull(), actual.value)
                assertEquals(line.getValue("line").text(), actual.line)
            }
            assertEquals("text: $text", case.getValue("body").text(), file.body)
        }
    }

    @Test
    fun `a backup size is written in B, KB or MB with a decimal comma`() {
        for (case in cases("sizes")) {
            assertEquals(case.getValue("label").text(), backupSizeLabel(case.getValue("bytes").jsonPrimitive.long))
        }
    }

    @Test
    fun `a backup date is written in Sao Paulo time with the year`() {
        for (case in cases("whens")) {
            assertEquals(case.getValue("label").text(), backupWhenLabel(Instant.parse(case.getValue("instant").text())))
        }
    }

    @Test
    fun `the version is the first eight characters of the hash`() {
        for (case in cases("versions")) {
            assertEquals(case.getValue("label").text(), fileVersion(case.getValue("hash").text()))
        }
    }
}
