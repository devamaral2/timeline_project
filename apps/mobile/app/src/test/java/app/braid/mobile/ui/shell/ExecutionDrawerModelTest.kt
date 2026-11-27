package app.braid.mobile.ui.shell

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.tasks.TaskCardDto
import app.braid.mobile.data.tasks.toDomain
import app.braid.mobile.domain.execution.ExecutionDrawerMode
import app.braid.mobile.domain.execution.executionRunsOf
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** O que a gaveta desenha e o que o leitor de tela lê, por altura, a partir das execuções da fixture. */
class ExecutionDrawerModelTest {
    private val runs =
        executionRunsOf(
            BraidJson
                .decodeFromString(
                    ListSerializer(TaskCardDto.serializer()),
                    Fixtures.text("execution-list-mixed"),
                ).map(TaskCardDto::toDomain),
        )

    private fun model(mode: ExecutionDrawerMode) = checkNotNull(executionDrawerModel(runs, mode))

    @Test
    fun `without runs the drawer does not exist`() {
        assertNull(executionDrawerModel(emptyList(), ExecutionDrawerMode.Three))
        assertNull(executionDrawerModel(emptyList(), ExecutionDrawerMode.All))
        assertNull(executionDrawerModel(emptyList(), ExecutionDrawerMode.One))
    }

    @Test
    fun `with five runs it shows the count, three rows and the plus two`() {
        val three = model(ExecutionDrawerMode.Three)

        assertEquals(5, three.total)
        assertEquals(3, three.shown)
        assertEquals("+2", three.rest)
        assertEquals(listOf(false, false, false, true, true), three.rows.map { it.hidden })
        assertEquals("5 tarefas de agente em andamento", three.countLabel)
    }

    @Test
    fun `the header toggles between three and all`() {
        val three = model(ExecutionDrawerMode.Three)
        assertEquals(ExecutionDrawerMode.All, three.toggleTarget)
        assertEquals("5 tarefas de agente em andamento. Mostrar todas", three.toggleLabel)
        assertFalse(three.expanded)

        val all = model(ExecutionDrawerMode.All)
        assertEquals(ExecutionDrawerMode.Three, all.toggleTarget)
        assertEquals("5 tarefas de agente em andamento. Mostrar só três", all.toggleLabel)
        assertTrue(all.expanded)
        assertEquals("", all.rest)
        assertTrue(all.rows.none { it.hidden })
    }

    @Test
    fun `at one row the header and every row are out of the screen reader and the row is a button that goes back to three`() {
        val one = model(ExecutionDrawerMode.One)

        assertTrue(one.headerHidden)
        assertTrue(one.rows.all { it.hidden })
        assertEquals("5 tarefas de agente em andamento, a mais recente é “Buscar passagens”. Mostrar três", one.expandLabel)
        assertEquals(ExecutionDrawerMode.Three, one.expandTarget)
    }

    @Test
    fun `only the first row carries the plus count and it is the count of the others`() {
        val rows = model(ExecutionDrawerMode.One).rows

        assertEquals("+4", rows.first().count)
        assertTrue(rows.drop(1).all { it.count == null })
    }

    @Test
    fun `a single run has no plus count and uses the singular`() {
        val single = checkNotNull(executionDrawerModel(runs.take(1), ExecutionDrawerMode.Three))

        assertEquals("1 tarefa de agente em andamento", single.countLabel)
        assertNull(single.rows.single().count)
        assertEquals("", single.rest)
    }

    @Test
    fun `rows enter in order, the first always there, the next two at three rows and the rest only with all`() {
        val rows = model(ExecutionDrawerMode.All).rows

        assertEquals(
            listOf(RowTier.First, RowTier.Peek, RowTier.Peek, RowTier.More, RowTier.More),
            rows.map { it.tier },
        )
        assertEquals(listOf(null, 1, 2, 1, 2), rows.map { it.step })
    }

    @Test
    fun `the drawer shows on the three tabs and nowhere else`() {
        for (tab in MainTab.entries) {
            assertTrue("$tab", executionDrawerShown(tab, hasRuns = true, chatOpen = false, menuOpen = false))
        }
        assertFalse("detail, edit, login", executionDrawerShown(null, hasRuns = true, chatOpen = false, menuOpen = false))
        assertFalse("no runs", executionDrawerShown(MainTab.Agenda, hasRuns = false, chatOpen = false, menuOpen = false))
        assertFalse("chat covers the screen", executionDrawerShown(MainTab.Tasks, hasRuns = true, chatOpen = true, menuOpen = false))
        assertFalse(
            "the section menu opens over it",
            executionDrawerShown(MainTab.Documents, hasRuns = true, chatOpen = false, menuOpen = true),
        )
    }
}
