package app.braid.mobile.domain.task

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Os quatro grupos de status de agente e as perguntas que os dois executores respondem, com os valores da spec. */
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
    fun `the groups hold the spec's values`() {
        assertEquals(
            setOf(TaskStatus.Preparing, TaskStatus.Queued, TaskStatus.Starting, TaskStatus.Running, TaskStatus.Waiting),
            OPEN_AGENT_STATUSES,
        )
        assertEquals(
            setOf(TaskStatus.Preparing, TaskStatus.Queued, TaskStatus.Starting, TaskStatus.Running),
            IN_PROGRESS_AGENT_STATUSES,
        )
        assertEquals(
            setOf(TaskStatus.Completed, TaskStatus.Interrupted, TaskStatus.Failed, TaskStatus.Cancelled, TaskStatus.RolledBack),
            FINAL_AGENT_STATUSES,
        )
        assertEquals(setOf(TaskStatus.Completed), SUCCESS_AGENT_STATUSES)
    }

    @Test
    fun `the agent statuses share no code with the person statuses`() {
        val person = listOf("todo", "toDefine", "doing", "inHold", "done", "cancel", "missed")
        val agent = OPEN_AGENT_STATUSES + FINAL_AGENT_STATUSES

        assertEquals(10, agent.size)
        assertEquals(emptyList<String>(), agent.map { it.code }.filter { it in person })
    }

    @Test
    fun `each status answers the four questions`() {
        val moving = Groups(open = true, inProgress = true, final = false, success = false)
        val ended = Groups(open = false, inProgress = false, final = true, success = false)
        for (status in listOf(TaskStatus.Preparing, TaskStatus.Queued, TaskStatus.Starting, TaskStatus.Running)) {
            assertEquals("$status", moving, groupsOf(status))
        }
        assertEquals(Groups(open = true, inProgress = false, final = false, success = false), groupsOf(TaskStatus.Waiting))
        assertEquals(Groups(open = false, inProgress = false, final = true, success = true), groupsOf(TaskStatus.Completed))
        for (status in listOf(TaskStatus.Interrupted, TaskStatus.Failed, TaskStatus.Cancelled, TaskStatus.RolledBack)) {
            assertEquals("$status", ended, groupsOf(status))
        }
        // Os status de pessoa não são de agente: nenhum grupo os conhece.
        for (status in listOf(TaskStatus.Done, TaskStatus.Cancel, TaskStatus.Todo)) {
            assertEquals("$status", Groups(open = false, inProgress = false, final = false, success = false), groupsOf(status))
        }
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
    fun `a person card is silenced by done and cancel and an agent card by any final status`() {
        for (actor in TaskActor.entries) {
            assertFalse("$actor todo", silencesReminder(actor, TaskStatus.Todo))
            assertFalse("$actor none", silencesReminder(actor, null))
            assertFalse("$actor unknown", silencesReminder(actor, TaskStatus.Unknown))
        }
        assertTrue(silencesReminder(TaskActor.Human, TaskStatus.Done))
        assertTrue(silencesReminder(TaskActor.Human, TaskStatus.Cancel))
        assertFalse(silencesReminder(TaskActor.Human, TaskStatus.Missed))
        for (status in TaskStatus.entries) {
            assertEquals("agent $status", status in FINAL_AGENT_STATUSES, silencesReminder(TaskActor.Agent, status))
        }
    }

    @Test
    fun `a subtask is closed when its executor is done with it`() {
        val human = setOf(TaskStatus.Done, TaskStatus.Cancel, TaskStatus.Missed)
        val agent = FINAL_AGENT_STATUSES

        for (status in TaskStatus.entries) {
            assertEquals("human $status", status in human, isSubtaskClosed(TaskActor.Human, status))
            assertEquals("agent $status", status in agent, isSubtaskClosed(TaskActor.Agent, status))
        }
        assertFalse(isSubtaskClosed(TaskActor.Human, null))
    }

    @Test
    fun `a subtask is done only by its success status`() {
        for (status in TaskStatus.entries) {
            assertEquals("human $status", status == TaskStatus.Done, isSubtaskDone(TaskActor.Human, status))
            assertEquals("agent $status", status == TaskStatus.Completed, isSubtaskDone(TaskActor.Agent, status))
        }
        for (actor in TaskActor.entries) assertFalse(isSubtaskDone(actor, null))
    }
}
