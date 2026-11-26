package app.braid.mobile.ui.tasks

import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** O nome do status novo e o desenho dos dois tipos novos: o mesmo texto e o mesmo traço do web (`task-status-glyph.tsx`, `task-kind-mark.tsx`). */
class SavedContentLabelsTest {
    @Test
    fun `the status awaiting transcription is named for the screen reader as in the web`() {
        assertEquals("Agente, aguardando a transcrição", taskStatusName(TaskActor.Agent, TaskStatus.AwaitingTranscription))
    }

    @Test
    fun `the new kinds keep the codes the contract uses`() {
        assertEquals("save_content", TaskKind.SaveContent.code)
        assertEquals("save_content_with_transcription", TaskKind.SaveContentWithTranscription.code)
        assertEquals(TaskKind.SaveContent, TaskKind.fromCode("save_content"))
        assertEquals(TaskKind.SaveContentWithTranscription, TaskKind.fromCode("save_content_with_transcription"))
        assertEquals(TaskStatus.AwaitingTranscription, TaskStatus.fromCode("awaiting_transcription"))
    }

    @Test
    fun `every kind has an icon`() {
        for (kind in TaskKind.entries) assertTrue(kind.code, BraidIcons.taskKind(kind.code).isNotEmpty())
    }
}
