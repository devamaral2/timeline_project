package app.braid.mobile.ui.tasks

import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Test

/** O nome acessível de cada um dos onze status de agente, no padrão "Agente, concluído" do web. */
class AgentStatusNamesTest {
    @Test
    fun `each agent status has its accessible name`() {
        val names =
            mapOf(
                TaskStatus.Preparing to "Agente, preparando",
                TaskStatus.Queued to "Agente, na fila",
                TaskStatus.Starting to "Agente, iniciando",
                TaskStatus.Running to "Agente, trabalhando",
                TaskStatus.Waiting to "Agente, esperando",
                TaskStatus.AwaitingTranscription to "Agente, esperando transcrição",
                TaskStatus.Completed to "Agente, concluído",
                TaskStatus.Interrupted to "Agente, interrompido",
                TaskStatus.Failed to "Agente, falhou",
                TaskStatus.Cancelled to "Agente, cancelado",
                TaskStatus.RolledBack to "Agente, revertido",
            )

        for ((status, name) in names) assertEquals("$status", name, taskStatusName(TaskActor.Agent, status))
    }

    @Test
    fun `the person names do not change`() {
        assertEquals("Feito", taskStatusName(TaskActor.Human, TaskStatus.Done))
        assertEquals("Cancelado", taskStatusName(TaskActor.Human, TaskStatus.Cancel))
    }
}
