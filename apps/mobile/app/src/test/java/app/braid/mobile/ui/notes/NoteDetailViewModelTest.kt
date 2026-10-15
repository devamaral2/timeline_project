package app.braid.mobile.ui.notes

import app.braid.mobile.data.dto.NoteLinkDto
import app.braid.mobile.data.notes.NoteResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NoteDetailViewModelTest {
    @Test
    fun pendingMealRefreshesUntilTerminalAndCannotBeEditedOrDetached() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val json = kotlinx.serialization.json.Json
            val pending =
                sampleNote().copy(
                    type = "meal",
                    data = json.parseToJsonElement("""{"generation":{"status":"pending"}}""") as kotlinx.serialization.json.JsonObject,
                    links = listOf(NoteLinkDto("event", "event-1", "Almoço")),
                )
            val completed =
                pending.copy(
                    revision = 2,
                    data = json.parseToJsonElement("""{"generation":{"status":"completed"}}""") as kotlinx.serialization.json.JsonObject,
                )
            val gateway = gatewayWith(pending, completed)
            val viewModel = NoteDetailViewModel(gateway)
            viewModel.load("note-1")
            kotlinx.coroutines.test.runCurrent()
            viewModel.startEditing()
            viewModel.save(NoteDraft(content = "Não deve salvar"))
            viewModel.detach()
            assertTrue(gateway.updated.isEmpty())
            assertFalse((viewModel.state.value as NoteDetailUiState.Content).isEditing)
            advanceUntilIdle()
            assertEquals(completed, (viewModel.state.value as NoteDetailUiState.Content).note)
        }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun gatewayWith(vararg notes: app.braid.mobile.data.dto.NoteDto) =
        FakeNoteGateway(detailResults = notes.map { NoteResult.Success(it) }.toMutableList<NoteResult<app.braid.mobile.data.dto.NoteDto>>())

    @Test
    fun loadPublishesTheNote() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val note = sampleNote()
            val viewModel = NoteDetailViewModel(gatewayWith(note))

            viewModel.load("note-1")
            advanceUntilIdle()

            assertEquals(NoteDetailUiState.Content(note), viewModel.state.value)
        }

    @Test
    fun failedLoadPublishesTheError() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = NoteDetailViewModel(FakeNoteGateway())

            viewModel.load("note-1")
            advanceUntilIdle()

            assertEquals(NoteDetailUiState.Error, viewModel.state.value)
        }

    @Test
    fun saveSendsTheExpectedRevisionAndReloadsTheServerVersion() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = gatewayWith(sampleNote(revision = 2), sampleNote(revision = 3, name = "Novo título"))
            val viewModel = NoteDetailViewModel(gateway)
            viewModel.load("note-1")
            advanceUntilIdle()
            viewModel.startEditing()

            viewModel.save(NoteDraft(name = "Novo título", content = "Texto novo", tags = listOf("casa")))
            advanceUntilIdle()

            val (id, input) = gateway.updated.single()
            assertEquals("note-1", id)
            assertEquals(2, input.expectedRevision)
            assertEquals("Novo título", input.name)
            assertEquals("Texto novo", input.content)
            val content = viewModel.state.value as NoteDetailUiState.Content
            assertEquals(3, content.note.revision)
            assertFalse(content.isEditing)
        }

    @Test
    fun failedSaveKeepsTheEditorOpenWithARecoverableError() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = gatewayWith(sampleNote()).apply { updateResult = unavailable }
            val viewModel = NoteDetailViewModel(gateway)
            viewModel.load("note-1")
            advanceUntilIdle()
            viewModel.startEditing()

            viewModel.save(NoteDraft(content = "Texto"))
            advanceUntilIdle()

            val content = viewModel.state.value as NoteDetailUiState.Content
            assertTrue(content.isEditing)
            assertFalse(content.isSaving)
            assertEquals("Não foi possível salvar a nota. Tente novamente.", content.actionError)
        }

    @Test
    fun detachSendsAnExplicitDetachAndReloads() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val linked = sampleNote().copy(links = listOf(NoteLinkDto("task", "task-1", "Revisar proposta")))
            val gateway = gatewayWith(linked, sampleNote(revision = 2))
            val viewModel = NoteDetailViewModel(gateway)
            viewModel.load("note-1")
            advanceUntilIdle()

            viewModel.detach()
            advanceUntilIdle()

            assertTrue(
                gateway.updated
                    .single()
                    .second.detach,
            )
            assertEquals(null, (viewModel.state.value as NoteDetailUiState.Content).note.link)
        }

    @Test
    fun detachDoesNothingForALooseNote() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = gatewayWith(sampleNote())
            val viewModel = NoteDetailViewModel(gateway)
            viewModel.load("note-1")
            advanceUntilIdle()

            viewModel.detach()
            advanceUntilIdle()

            assertTrue(gateway.updated.isEmpty())
        }

    @Test
    fun deletePublishesDeletedAndAFailureStaysRecoverable() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = gatewayWith(sampleNote())
            val viewModel = NoteDetailViewModel(gateway)
            viewModel.load("note-1")
            advanceUntilIdle()

            gateway.deleteResult = unavailable
            viewModel.startDeleting()
            viewModel.delete()
            advanceUntilIdle()
            val failed = viewModel.state.value as NoteDetailUiState.Content
            assertTrue(failed.isDeleting)
            assertEquals("Não foi possível excluir a nota. Tente novamente.", failed.actionError)

            gateway.deleteResult = NoteResult.Success(Unit)
            viewModel.delete()
            advanceUntilIdle()
            assertEquals(NoteDetailUiState.Deleted, viewModel.state.value)
            assertEquals(listOf("note-1", "note-1"), gateway.deleted)
        }
}
