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
 * A arrumação da linha da tarefa (o que o `task-row.test.tsx` do web confere no DOM): título, linha do tipo com o
 * "quando" e a duração, tags em linha própria e a ponta direita de duas linhas (prioridade ou status; provedor e marca do
 * projeto). O Compose só pinta este modelo.
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
    fun `the project mark stands alone in the second line of the right end, the same for a person and an agent`() {
        val person = taskRowLayout(card(project = timelineProject, withTimes = true), now)
        val agent = taskRowLayout(agentCard(project = timelineProject), now)

        for (layout in listOf(person, agent)) {
            assertEquals(timelineProject, layout.side.marks.project)
            assertEquals("timeline_project", layout.side.marks.project.name)
        }
    }

    @Test
    fun `the personal project also has its mark`() {
        assertEquals(Project.Personal, taskRowLayout(card(), now).side.marks.project)
    }

    @Test
    fun `a person's row carries the duration at the top of the right end and the priority beside the project mark, with no provider`() {
        val layout = taskRowLayout(card(priority = TaskPriority.High, model = chosenModel, withTimes = true), now)

        assertEquals(TaskRowTop.Duration("1h30"), layout.side.top)
        assertEquals(TaskPriority.High, layout.side.marks.priority)
        assertEquals("personal", layout.side.marks.project.name)
        assertNull(layout.side.marks.provider)
        // A duração não se repete na linha do tipo.
        assertNull(layout.meta.duration)
    }

    @Test
    fun `a person's row without a duration keeps the top place empty`() {
        val layout = taskRowLayout(card(priority = TaskPriority.Low), now)

        assertEquals(TaskRowTop.Duration(null), layout.side.top)
        assertEquals(TaskPriority.Low, layout.side.marks.priority)
    }

    @Test
    fun `an agent's row shows the status instead of a priority, and the provider goes before the project mark`() {
        val layout = taskRowLayout(agentCard(priority = TaskPriority.Urgent, model = chosenModel), now)

        assertEquals(TaskRowTop.AgentStatus(TaskStatus.Completed), layout.side.top)
        assertNull(layout.side.marks.priority)
        assertEquals(ModelProvider.Anthropic, layout.side.marks.provider)
        assertEquals("personal", layout.side.marks.project.name)
    }

    @Test
    fun `an agent's row without the model choice has no provider`() {
        val layout = taskRowLayout(agentCard(status = TaskStatus.Queued), now)

        assertNull(layout.side.marks.provider)
    }

    @Test
    fun `the tags sit in a line of their own, below the kind and the when`() {
        val layout = taskRowLayout(card(tags = listOf("trabalho"), withTimes = true), now)

        assertEquals("Hoje, 09:00", layout.meta.whenText)
        assertEquals(listOf("trabalho"), layout.tags)
    }

    @Test
    fun `an agent's duration stays next to the when, since the status takes the top of the right end`() {
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
