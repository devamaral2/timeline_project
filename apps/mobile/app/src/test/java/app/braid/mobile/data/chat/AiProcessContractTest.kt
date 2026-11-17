package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AiProcessDto
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** O decoder estrito do app contra a fixture versionada do contrato TS. */
class AiProcessContractTest {
    private val processes: Map<String, AiProcessDto> =
        Json
            .decodeFromString<List<AiProcessDto>>(
                requireNotNull(javaClass.classLoader?.getResource("fixtures/ai-process.json")).readText(),
            ).associateBy { it.id }

    @Test
    fun everyFixtureDecodesWithTheStrictDecoder() {
        assertEquals(
            setOf("process-guide", "process-running", "process-failed", "process-query", "process-reply"),
            processes.keys,
        )
    }

    @Test
    fun runningProcessKeepsStepStatesAndIsNotTerminal() {
        val running = processes.getValue("process-running")
        assertFalse(running.terminal)
        assertEquals(listOf("succeeded", "running", "pending"), running.steps.map { it.status })
        assertTrue(running.steps[0].succeeded)
        assertTrue(running.steps[1].running)
        assertEquals("Realizando processos:", running.title)
    }

    @Test
    fun completedProcessKeepsEntitiesAndTheirLinks() {
        val guide = processes.getValue("process-guide")
        assertTrue(guide.terminal)
        assertEquals(listOf("Criando eventos", "Criando notas"), guide.steps.map { it.label })
        assertEquals(
            "note",
            guide.entities[0]
                .linkedTo
                .single()
                .kind,
        )
        assertEquals(
            "event-1",
            guide.entities[1]
                .linkedTo
                .single()
                .id,
        )
        assertNull(guide.message)
    }

    @Test
    fun failedStepCarriesItsCodeAndTheProcessItsMessage() {
        val failed = processes.getValue("process-failed")
        assertTrue(failed.steps.last().failed)
        assertEquals("agent_timeout", failed.steps.last().errorCode)
        assertEquals("Criei o evento, mas não consegui criar a nota.", failed.message)
    }

    @Test
    fun queryStepCarriesItsRows() {
        val result =
            processes
                .getValue("process-query")
                .steps
                .single()
                .result
        assertEquals(listOf("name", "started_at"), result?.columns)
        assertEquals("Reunião", (result?.rows?.single()?.first() as kotlinx.serialization.json.JsonPrimitive).content)
        assertFalse(result?.truncated ?: true)
    }

    @Test
    fun replyFromTheFallbackIsJustAMessage() {
        val reply = processes.getValue("process-reply")
        assertEquals("Paris.", reply.message)
        assertEquals("Analisando o pedido", reply.steps.single().label)
    }
}
