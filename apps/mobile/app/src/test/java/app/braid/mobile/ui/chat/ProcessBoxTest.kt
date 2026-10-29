package app.braid.mobile.ui.chat

import app.braid.mobile.data.dto.AiProcessStepDto
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

class ProcessBoxTest {
    private fun step(status: String) = AiProcessStepDto("s", "event-create", "Criando eventos", status)

    @Test
    fun screenReadersGetTheStateOfEachStepInWords() {
        assertEquals("concluído", stepStatusText(step("succeeded")))
        assertEquals("falhou", stepStatusText(step("failed")))
        assertEquals("em andamento", stepStatusText(step("running")))
        assertEquals("aguardando", stepStatusText(step("pending")))
    }

    @Test
    fun cellsRenderNullAsEmptyAndTextWithoutQuotes() {
        assertEquals("", cellText(JsonNull))
        assertEquals("Reunião", cellText(JsonPrimitive("Reunião")))
        assertEquals("3", cellText(JsonPrimitive(3)))
        assertEquals("""{"a":1}""", cellText(buildJsonObject { put("a", 1) }))
    }
}
