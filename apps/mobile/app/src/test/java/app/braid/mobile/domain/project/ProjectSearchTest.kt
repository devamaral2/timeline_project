package app.braid.mobile.domain.project

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.projects.ProjectDto
import app.braid.mobile.data.projects.toDomain
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** A busca do campo "Projeto": pelo nome, sem acento nem maiúsculas, na ordem em que a API lista. */
class ProjectSearchTest {
    private val projects =
        BraidJson
            .decodeFromString(ListSerializer(ProjectDto.serializer()), Fixtures.text("projects-list"))
            .map(ProjectDto::toDomain)

    private fun found(query: String) = searchProjects(projects, query).map { it.name }

    @Test
    fun `the list is personal first and the others by name`() {
        assertEquals(listOf("personal", "Açaí", "agent-skills", "timeline_project"), found(""))
        assertTrue(projects.first().personal)
    }

    @Test
    fun `a search ignores accents and case`() {
        assertEquals(listOf("Açaí"), found("acai"))
        assertEquals(listOf("Açaí"), found("AÇAÍ"))
        assertEquals(listOf("timeline_project"), found("TimeLine"))
    }

    @Test
    fun `a search matches any part of the name`() {
        assertEquals(listOf("personal", "agent-skills", "timeline_project"), found("e"))
        assertEquals(listOf("agent-skills"), found("-sk"))
        assertEquals(emptyList<String>(), found("zzz"))
    }
}
