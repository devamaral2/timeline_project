package app.braid.mobile.ui.tasks

import app.braid.mobile.domain.project.Project
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * A arrumação da linha da tarefa (o que o `task-row.test.tsx` do web confere no DOM): título com as marcas da ponta
 * direita (prioridade ou provedor, e o projeto), a linha do tipo com o "quando", a duração e o status do agente, e as
 * tags em linha própria. O Compose só pinta este modelo.
 */
class TaskRowLayoutTest {
    private val now = Instant.parse("2026-09-14T10:00:00-03:00")
    private val timelineProject = Project(id = "p-tp", name = "timeline_project", personal = false)

    private fun card(
        actor: TaskActor = TaskActor.Human,
        kind: TaskKind = TaskKind.Common,
        status: TaskStatus? = TaskStatus.Todo,
        priority: TaskPriority = TaskPriority.Medium,
        tags: List<String> = emptyList(),
        project: Project = Project.Personal,
        model: ModelSelection? = null,
        withTimes: Boolean = false,
    ) = TaskCard(
        id = "task",
        actor = actor,
        kind = kind,
        status = status,
        name = "Revisar proposta",
        startedAt = if (withTimes) Instant.parse("2026-09-14T09:00:00-03:00") else null,
        estimatedFinishAt = if (withTimes) Instant.parse("2026-09-14T10:30:00-03:00") else null,
        longRunning = false,
        tags = tags,
        revision = 1,
        priority = priority,
        project = project,
        model = model,
    )

    private fun agentCard(
        status: TaskStatus = TaskStatus.Completed,
        priority: TaskPriority = TaskPriority.Medium,
        project: Project = Project.Personal,
        model: ModelSelection? = null,
        withTimes: Boolean = false,
    ) = card(
        withTimes = withTimes,
        actor = TaskActor.Agent,
        kind = TaskKind.Request,
        status = status,
        priority = priority,
        project = project,
        model = model,
    )

    private val chosenModel = ModelSelection(ModelProvider.Anthropic, "um-modelo", ModelEffort.High)

    @Test
    fun `the project mark stands alone at the right end of the title line, the same for a person and an agent`() {
        val person = taskRowLayout(card(project = timelineProject, withTimes = true), now)
        val agent = taskRowLayout(agentCard(project = timelineProject), now)

        for (layout in listOf(person, agent)) {
            assertEquals(timelineProject, layout.marks.project)
            assertEquals("timeline_project", layout.marks.project.name)
        }
    }

    @Test
    fun `the personal project also has its mark`() {
        assertEquals(Project.Personal, taskRowLayout(card(), now).marks.project)
    }

    @Test
    fun `a person's row carries the priority beside the project mark and the duration on the kind line`() {
        val layout = taskRowLayout(card(priority = TaskPriority.High, model = chosenModel, withTimes = true), now)

        assertEquals(TaskPriority.High, layout.marks.priority)
        assertEquals("diario", layout.marks.project.name)
        assertNull(layout.marks.provider)
        assertEquals("1h30", layout.meta.duration)
        assertNull(layout.meta.agentStatus)
    }

    @Test
    fun `a person's row without a duration keeps the marks on the title line`() {
        val layout = taskRowLayout(card(priority = TaskPriority.Low), now)

        assertNull(layout.meta.duration)
        assertEquals(TaskPriority.Low, layout.marks.priority)
    }

    @Test
    fun `an agent's row has no priority, the provider goes before the project mark and the status on the kind line`() {
        val layout = taskRowLayout(agentCard(priority = TaskPriority.Urgent, model = chosenModel), now)

        assertEquals(TaskRowAgentStatus(TaskStatus.Completed), layout.meta.agentStatus)
        assertNull(layout.marks.priority)
        assertEquals(ModelProvider.Anthropic, layout.marks.provider)
        assertEquals("diario", layout.marks.project.name)
    }

    @Test
    fun `an agent's row without the model choice has no provider`() {
        val layout = taskRowLayout(agentCard(status = TaskStatus.Queued), now)

        assertNull(layout.marks.provider)
    }

    @Test
    fun `the tags sit in a line of their own, below the kind and the when`() {
        val layout = taskRowLayout(card(tags = listOf("trabalho"), withTimes = true), now)

        assertEquals("Hoje, 09:00", layout.meta.whenText)
        assertEquals(listOf("trabalho"), layout.tags)
    }

    @Test
    fun `an agent's duration stays next to the when`() {
        val layout = taskRowLayout(agentCard(withTimes = true), now)

        assertEquals("1h30", layout.meta.duration)
    }

    @Test
    fun `without tags there is no tags line`() {
        assertTrue(taskRowLayout(card(tags = emptyList()), now).tags.isEmpty())
    }

    @Test
    fun `without a start and an end there is no duration`() {
        assertNull(taskRowLayout(agentCard(), now).meta.duration)
    }
}
