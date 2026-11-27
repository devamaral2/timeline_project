package app.braid.mobile.ui.tasks

import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.task.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/** Os onze ícones quadrados de status de agente: desenho, cor e movimento, conferidos contra a tabela do web (ticket 63). */
class AgentStatusIconTest {
    private val agentStatuses =
        listOf(
            TaskStatus.Preparing,
            TaskStatus.Queued,
            TaskStatus.Starting,
            TaskStatus.Running,
            TaskStatus.Waiting,
            TaskStatus.AwaitingTranscription,
            TaskStatus.Completed,
            TaskStatus.Interrupted,
            TaskStatus.Failed,
            TaskStatus.Cancelled,
            TaskStatus.RolledBack,
        )

    @Test
    fun `each status has its colour tone`() {
        val tones =
            mapOf(
                TaskStatus.Preparing to AgentIconTone.Muted,
                TaskStatus.Queued to AgentIconTone.Muted,
                TaskStatus.Cancelled to AgentIconTone.Muted,
                TaskStatus.AwaitingTranscription to AgentIconTone.Muted,
                TaskStatus.RolledBack to AgentIconTone.Muted,
                TaskStatus.Starting to AgentIconTone.Accent,
                TaskStatus.Running to AgentIconTone.Accent,
                TaskStatus.Waiting to AgentIconTone.Warning,
                TaskStatus.Interrupted to AgentIconTone.Warning,
                TaskStatus.Completed to AgentIconTone.Success,
                TaskStatus.Failed to AgentIconTone.Destructive,
            )

        for (status in agentStatuses) assertEquals("$status", tones.getValue(status), agentStatusIcon(status).tone)
    }

    @Test
    fun `the square frame varies only for preparing, starting and completed`() {
        val frames = agentStatuses.associateWith { agentStatusIcon(it).frame }

        assertEquals(AgentIconFrame.Dashed, frames.getValue(TaskStatus.Preparing))
        assertEquals(AgentIconFrame.Dim, frames.getValue(TaskStatus.Starting))
        assertEquals(AgentIconFrame.Solid, frames.getValue(TaskStatus.Completed))
        for (status in agentStatuses - setOf(TaskStatus.Preparing, TaskStatus.Starting, TaskStatus.Completed)) {
            assertEquals("$status", AgentIconFrame.Plain, frames.getValue(status))
        }
    }

    @Test
    fun `preparing draws nothing inside and every other status draws something`() {
        assertTrue(agentStatusIcon(TaskStatus.Preparing).inside.isEmpty())
        for (status in agentStatuses - TaskStatus.Preparing) assertTrue("$status", agentStatusIcon(status).inside.isNotEmpty())
    }

    @Test
    fun `the eleven drawings are all different`() {
        assertEquals(11, agentStatuses.map { agentStatusIcon(it) }.toSet().size)
    }

    @Test
    fun `awaiting transcription is the plain square with a hollow ring of radius 3 at the centre`() {
        val icon = agentStatusIcon(TaskStatus.AwaitingTranscription)

        assertEquals(AgentIconFrame.Plain, icon.frame)
        assertEquals(listOf<AgentIconShape>(AgentIconShape.Hollow(10f, 10f, 3f)), icon.inside)
    }

    @Test
    fun `what is drawn inside is centred on the middle of the 20 grid`() {
        for (status in agentStatuses - TaskStatus.Preparing) {
            val box = agentStatusIcon(status).insideBounds()
            assertTrue("$status horizontal: ${box.centerX}", abs(box.centerX - 10f) <= 0.3f)
            assertTrue("$status vertical: ${box.centerY}", abs(box.centerY - 10f) <= 0.3f)
        }
    }

    @Test
    fun `only starting spins and only running pulses`() {
        for (status in agentStatuses) {
            val expected =
                when (status) {
                    TaskStatus.Starting -> AgentIconMotion.Spin
                    TaskStatus.Running -> AgentIconMotion.Pulse
                    else -> AgentIconMotion.None
                }
            assertEquals("$status", expected, agentStatusIcon(status).motion(reducedMotion = false))
        }
    }

    @Test
    fun `with reduced motion no icon moves`() {
        for (status in agentStatuses) assertEquals("$status", AgentIconMotion.None, agentStatusIcon(status).motion(reducedMotion = true))
    }

    @Test
    fun `a status that is not an agent's, or unknown, is the plain muted square`() {
        for (status in listOf(null, TaskStatus.Unknown, TaskStatus.Done)) {
            val icon = agentStatusIcon(status)
            assertEquals(AgentIconTone.Muted, icon.tone)
            assertEquals(AgentIconFrame.Plain, icon.frame)
            assertTrue(icon.inside.isEmpty())
        }
    }

    @Test
    fun `the status names are the web's`() {
        val names =
            listOf(
                "Preparando",
                "Na fila",
                "Iniciando",
                "Trabalhando",
                "Esperando",
                "Esperando transcrição",
                "Concluído",
                "Interrompido",
                "Falhou",
                "Cancelado",
                "Revertido",
            )

        assertEquals(names, agentStatuses.map { agentStatusLabel(it) })
        assertEquals(null, agentStatusLabel(TaskStatus.Unknown))
    }

    @Test
    fun `the provider names are the web's`() {
        assertEquals(listOf("Anthropic", "OpenAI", "OpenRouter"), ModelProvider.entries.map { it.label })
    }
}
