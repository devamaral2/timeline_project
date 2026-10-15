package app.braid.mobile.ui.event

import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.TextEventNoteDto
import app.braid.mobile.data.dto.TextNoteDataDto
import app.braid.mobile.data.dto.TimelineEventPageDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventQuery
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.data.notes.NoteResult
import app.braid.mobile.domain.events.linkableNotesOf
import app.braid.mobile.domain.events.noteTypeForEventKind
import app.braid.mobile.ui.notes.FakeNoteGateway
import app.braid.mobile.ui.notes.sampleNote
import app.braid.mobile.ui.notes.unavailable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EditEventViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun eachEventKindMapsToTheNoteTypeThatFitsIt() {
        assertEquals("meal", noteTypeForEventKind("meal"))
        assertEquals("sleep", noteTypeForEventKind("sleep"))
        assertEquals("training", noteTypeForEventKind("training"))
        assertEquals("text", noteTypeForEventKind("routine"))
    }

    @Test
    fun linkableNotesAreOnlyTheEventsTypeAndNotYetOnTheEvent() {
        val all =
            listOf(
                note("meal-1", "meal"),
                note("meal-2", "meal"),
                note("sleep-1", "sleep"),
                note("text-1", "text"),
            )

        assertEquals(listOf("meal-1", "meal-2"), linkableNotesOf(all, event("meal")).map { it.id })
        assertEquals(listOf("sleep-1"), linkableNotesOf(all, event("sleep")).map { it.id })
        assertEquals(listOf("text-1"), linkableNotesOf(all, event("routine")).map { it.id })
        assertEquals(listOf("meal-2"), linkableNotesOf(all, event("meal", linkedTextNoteId = "meal-1")).map { it.id })
    }

    @Test
    fun loadOffersOnlyNotesOfTheEventsType() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val notes =
                FakeNoteGateway(
                    listResult = NoteResult.Success(listOf(note("meal-1", "meal"), note("sleep-1", "sleep"))),
                )
            val viewModel = EditEventViewModel(FakeEventGateway(event("meal")), notes)

            viewModel.load("event-1")
            advanceUntilIdle()

            val state = viewModel.linkableNotes.value as LinkableNotesUiState.Loaded
            assertEquals(listOf("meal-1"), state.notes.map { it.id })
        }
    }

    @Test
    fun failedNotesLoadKeepsTheEventEditableAndReportsFailure() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val notes = FakeNoteGateway(listResult = unavailable)
            val viewModel = EditEventViewModel(FakeEventGateway(event("meal")), notes)

            viewModel.load("event-1")
            advanceUntilIdle()

            assertEquals(LinkableNotesUiState.Failed, viewModel.linkableNotes.value)
            assertEquals(true, viewModel.state.value is EditEventUiState.Content)
        }
    }

    private fun note(
        id: String,
        type: String,
    ): NoteDto = sampleNote(id = id).copy(type = type)

    private fun event(
        kind: String,
        linkedTextNoteId: String? = null,
    ) = EventDetailDto(
        id = "event-1",
        name = "Evento",
        description = "",
        startedAt = "2026-09-22T08:00:00Z",
        tags = emptyList(),
        missed = false,
        priority = "normal",
        notifyOffsetsMinutes = emptyList(),
        interruptions = emptyList(),
        revision = 1,
        kind = kind,
        notes =
            listOfNotNull(
                linkedTextNoteId?.let {
                    TextEventNoteDto(
                        id = it,
                        name = "Já associada",
                        schemaVersion = 1,
                        tags = emptyList(),
                        revision = 1,
                        createdAt = "2026-09-22T07:00:00Z",
                        updatedAt = "2026-09-22T07:00:00Z",
                        data = TextNoteDataDto(body = ""),
                    )
                },
            ),
    )

    private class FakeEventGateway(
        private val detail: EventDetailDto,
    ) : EventGateway {
        override suspend fun create(
            input: app.braid.mobile.data.dto.CreateEventInputDto,
        ): EventResult<app.braid.mobile.data.dto.CreateEventResponseDto> = error("not used")

        override suspend fun detail(eventId: String): EventResult<EventDetailDto> = EventResult.Success(detail)

        override suspend fun update(input: app.braid.mobile.data.dto.UpdateEventInputDto): EventResult<Unit> = error("not used")

        override suspend fun delete(eventId: String): EventResult<Unit> = error("not used")

        override suspend fun day(
            dayKey: String,
            query: EventQuery,
            forceRefresh: Boolean,
        ): EventResult<TimelineEventPageDto> = error("not used")
    }
}
