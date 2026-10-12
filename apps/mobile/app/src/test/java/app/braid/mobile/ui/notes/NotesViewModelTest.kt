package app.braid.mobile.ui.notes

import app.braid.mobile.data.notes.NoteResult
import app.braid.mobile.domain.notes.NoteFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NotesViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun loadPublishesTheNotes() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val notes = listOf(sampleNote("a"), sampleNote("b"))
            val viewModel = NotesViewModel(FakeNoteGateway(listResult = NoteResult.Success(notes)))

            viewModel.load()
            advanceUntilIdle()

            assertEquals(notes, viewModel.state.value.notes)
            assertFalse(viewModel.state.value.isLoading)
            assertFalse(viewModel.state.value.loadFailed)
        }

    @Test
    fun failedLoadIsRecoverableAndKeepsWhatWasAlreadyShown() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeNoteGateway(listResult = NoteResult.Success(listOf(sampleNote("a"))))
            val viewModel = NotesViewModel(gateway)
            viewModel.load()
            advanceUntilIdle()

            gateway.listResult = unavailable
            viewModel.load()
            advanceUntilIdle()

            assertTrue(viewModel.state.value.loadFailed)
            assertEquals(
                listOf("a"),
                viewModel.state.value.notes
                    ?.map { it.id },
            )
        }

    @Test
    fun filterAndSearchLiveInTheState() {
        val viewModel = NotesViewModel(FakeNoteGateway())

        viewModel.setFilter(NoteFilter.Tasks)
        viewModel.toggleSearch()
        viewModel.setQuery("proposta")
        assertEquals(NoteFilter.Tasks, viewModel.state.value.filter)
        assertEquals("proposta", viewModel.state.value.query)
        assertTrue(viewModel.state.value.isSearching)

        viewModel.toggleSearch()
        assertEquals("", viewModel.state.value.query)
        assertFalse(viewModel.state.value.isSearching)
    }

    @Test
    fun createSendsTheDraftClosesTheEditorAndOpensTheNewNote() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeNoteGateway()
            val viewModel = NotesViewModel(gateway)
            viewModel.startCreating()

            viewModel.create(NoteDraft(name = "  ", content = "Pagar o condomínio", tags = listOf("casa")))
            advanceUntilIdle()

            assertEquals("Pagar o condomínio", gateway.created.single().content)
            assertNull(gateway.created.single().name)
            assertEquals(listOf("casa"), gateway.created.single().tags)
            assertFalse(viewModel.state.value.isCreating)
            assertEquals(NotesEvent.OpenNote("note-new"), viewModel.uiEvents.first())
        }

    @Test
    fun failedCreateKeepsTheEditorOpenWithARecoverableError() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val viewModel = NotesViewModel(FakeNoteGateway(createResult = unavailable))
            viewModel.startCreating()

            viewModel.create(NoteDraft(content = "Texto"))
            advanceUntilIdle()

            assertTrue(viewModel.state.value.isCreating)
            assertFalse(viewModel.state.value.isSaving)
            assertEquals("Não foi possível salvar a nota. Tente novamente.", viewModel.state.value.saveError)
        }

    @Test
    fun blankDraftIsNeverSent() =
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeNoteGateway()
            val viewModel = NotesViewModel(gateway)

            viewModel.create(NoteDraft(content = "   "))
            advanceUntilIdle()

            assertTrue(gateway.created.isEmpty())
        }
}
