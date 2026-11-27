package app.braid.mobile.domain.task

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Os quatro grupos de status de agente e as perguntas que os dois executores respondem, com os valores de hoje. */
class AgentStatusGroupsTest {
    private data class Groups(
        val open: Boolean,
        val inProgress: Boolean,
        val final: Boolean,
        val success: Boolean,
    )

    private fun groupsOf(status: TaskStatus?) =
        Groups(
            open = isOpenAgentStatus(status),
            inProgress = isInProgressAgentStatus(status),
            final = isFinalAgentStatus(status),
            success = isSuccessAgentStatus(status),
        )

    @Test
    fun `the groups hold today's values`() {
        assertEquals(setOf(TaskStatus.Queued, TaskStatus.Running, TaskStatus.Waiting), OPEN_AGENT_STATUSES)
        assertEquals(setOf(TaskStatus.Queued, TaskStatus.Running), IN_PROGRESS_AGENT_STATUSES)
        assertEquals(setOf(TaskStatus.Done, TaskStatus.Failed, TaskStatus.Cancel), FINAL_AGENT_STATUSES)
        assertEquals(setOf(TaskStatus.Done), SUCCESS_AGENT_STATUSES)
    }

    @Test
    fun `each status answers the four questions`() {
        assertEquals(Groups(open = true, inProgress = true, final = false, success = false), groupsOf(TaskStatus.Queued))
        assertEquals(Groups(open = true, inProgress = true, final = false, success = false), groupsOf(TaskStatus.Running))
        assertEquals(Groups(open = true, inProgress = false, final = false, success = false), groupsOf(TaskStatus.Waiting))
        assertEquals(Groups(open = false, inProgress = false, final = true, success = true), groupsOf(TaskStatus.Done))
        assertEquals(Groups(open = false, inProgress = false, final = true, success = false), groupsOf(TaskStatus.Failed))
        assertEquals(Groups(open = false, inProgress = false, final = true, success = false), groupsOf(TaskStatus.Cancel))
        assertEquals(Groups(open = false, inProgress = false, final = false, success = false), groupsOf(TaskStatus.Todo))
    }

    @Test
    fun `an unknown status and no status belong to no group`() {
        val none = Groups(open = false, inProgress = false, final = false, success = false)

        assertEquals(none, groupsOf(TaskStatus.Unknown))
        assertEquals(none, groupsOf(null))
    }

    @Test
    fun `in progress sits inside open and success inside final`() {
        assertTrue(OPEN_AGENT_STATUSES.containsAll(IN_PROGRESS_AGENT_STATUSES))
        assertTrue(FINAL_AGENT_STATUSES.containsAll(SUCCESS_AGENT_STATUSES))
        assertTrue(OPEN_AGENT_STATUSES.intersect(FINAL_AGENT_STATUSES).isEmpty())
    }

    @Test
    fun `a finished card of either executor silences its reminder`() {
        for (actor in TaskActor.entries) {
            assertTrue("$actor done", silencesReminder(actor, TaskStatus.Done))
            assertTrue("$actor cancel", silencesReminder(actor, TaskStatus.Cancel))
            assertFalse("$actor todo", silencesReminder(actor, TaskStatus.Todo))
            assertFalse("$actor none", silencesReminder(actor, null))
            assertFalse("$actor unknown", silencesReminder(actor, TaskStatus.Unknown))
        }
        assertFalse(silencesReminder(TaskActor.Human, TaskStatus.Missed))
        assertFalse(silencesReminder(TaskActor.Agent, TaskStatus.Failed))
    }

    @Test
    fun `a subtask is closed when its executor is done with it`() {
        val human = setOf(TaskStatus.Done, TaskStatus.Cancel, TaskStatus.Missed)
        val agent = setOf(TaskStatus.Done, TaskStatus.Cancel, TaskStatus.Failed)

        for (status in TaskStatus.entries) {
            assertEquals("human $status", status in human, isSubtaskClosed(TaskActor.Human, status))
            assertEquals("agent $status", status in agent, isSubtaskClosed(TaskActor.Agent, status))
        }
        assertFalse(isSubtaskClosed(TaskActor.Human, null))
    }

    @Test
    fun `a subtask is done only by its success status`() {
        for (actor in TaskActor.entries) {
            for (status in TaskStatus.entries) {
                assertEquals("$actor $status", status == TaskStatus.Done, isSubtaskDone(actor, status))
            }
            assertFalse(isSubtaskDone(actor, null))
        }
    }
}
