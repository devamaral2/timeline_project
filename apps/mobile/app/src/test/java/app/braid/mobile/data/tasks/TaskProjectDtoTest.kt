package app.braid.mobile.data.tasks

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.requests.RequestDto
import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.domain.project.Project
import app.braid.mobile.support.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Test

/** O projeto que o cartão, a tarefa e o pedido trazem (spec 51): o app o lê do contrato, sem inventar `personal`. */
class TaskProjectDtoTest {
    private val timeline = Project(id = "project-timeline", name = "timeline_project", personal = false)
    private val skills = Project(id = "project-skills", name = "agent-skills", personal = false)
    private val personal = Project(id = "project-personal", name = "personal", personal = true)

    @Test
    fun `a card of the agenda page carries its project`() {
        val page = BraidJson.decodeFromString(AgendaPageDto.serializer(), Fixtures.text("tasks-agenda-page-1"))

        val projects = page.items.associate { it.id to it.toDomain().project }

        assertEquals(timeline, projects.getValue("task-1"))
        assertEquals(skills, projects.getValue("task-3"))
        assertEquals(personal, projects.getValue("task-2"))
    }

    @Test
    fun `the task detail carries its project, for a person task and an agent task`() {
        fun detail(name: String) = BraidJson.decodeFromString(TaskDetailDto.serializer(), Fixtures.text(name)).toDomain()

        assertEquals(timeline, detail("task-detail-person").card.project)
        assertEquals(skills, detail("task-detail-agent").card.project)
        assertEquals(personal, detail("task-detail-minimal").card.project)
    }

    @Test
    fun `the request carries its project`() {
        val request = BraidJson.decodeFromString(RequestDto.serializer(), Fixtures.text("request-running")).toDomain()

        assertEquals(skills, request.project)
    }
}
