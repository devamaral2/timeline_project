package app.braid.mobile.domain.events

import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.EventNoteDto
import app.braid.mobile.data.dto.SleepEventNoteDto
import app.braid.mobile.data.dto.SleepItemDto
import app.braid.mobile.data.dto.TextEventNoteDto
import app.braid.mobile.data.dto.TextNoteDataDto
import app.braid.mobile.data.dto.UpdateEventNoteDto
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EventNotesTest {
    private val text = textNote("note-text")
    private val sleep = sleepNote("note-sleep")

    @Test
    fun primaryNoteIsTheFirstOneWhoseTypeIsTheEventKindNotTheFirstPosition() {
        val event = event(kind = "sleep", notes = listOf(text, sleep))

        assertEquals("note-sleep", event.primaryNote()?.id)
    }

    @Test
    fun primaryNoteIsNullWhenTheEventHasNoNoteOfItsKind() {
        assertNull(event(kind = "meal", notes = listOf(text, sleep)).primaryNote())
        assertNull(event(kind = "routine", notes = emptyList()).primaryNote())
    }

    @Test
    fun patchKeepsOtherNotesWithOnlyTheirIdAndReplacesTheEditedOne() {
        val event = event(kind = "sleep", notes = listOf(text, sleep))
        val edited = UpdateEventNoteDto.edited(sleep, SleepItemDto(trackedSleepTime = 8.0, score = 90.0))

        val patched = event.notesPatchedWith(sleep.id, edited)

        assertEquals(listOf(UpdateEventNoteDto(id = "note-text"), edited), patched)
        assertEquals("note-sleep", edited.id)
        assertEquals(1, edited.schemaVersion)
        assertEquals("sleep", edited.type)
        assertEquals(JsonPrimitive(8.0), edited.data?.jsonObject?.get("trackedSleepTime"))
    }

    @Test
    fun patchAppendsANewNoteWithoutIdWhenTheEventHasNoneOfItsKind() {
        val event = event(kind = "sleep", notes = listOf(text))
        val created = UpdateEventNoteDto.created(SleepItemDto(trackedSleepTime = 7.0, score = 80.0))

        val patched = event.notesPatchedWith(null, created)

        assertEquals(listOf(UpdateEventNoteDto(id = "note-text"), created), patched)
        assertNull(created.id)
        assertNull(created.schemaVersion)
        assertEquals("sleep", created.type)
    }

    @Test
    fun aKeptNoteCarriesNothingButItsId() {
        val kept = UpdateEventNoteDto.keep(text)

        assertEquals(UpdateEventNoteDto(id = "note-text"), kept)
    }

    private fun textNote(id: String): EventNoteDto =
        TextEventNoteDto(
            id = id,
            name = "Pauta",
            schemaVersion = 1,
            tags = emptyList(),
            revision = 1,
            createdAt = "2026-09-22T07:00:00Z",
            updatedAt = "2026-09-22T07:00:00Z",
            data = TextNoteDataDto(body = "Revisar a semana"),
        )

    private fun sleepNote(id: String): EventNoteDto =
        SleepEventNoteDto(
            id = id,
            name = "Noite anterior",
            schemaVersion = 1,
            tags = emptyList(),
            revision = 1,
            createdAt = "2026-09-22T07:00:00Z",
            updatedAt = "2026-09-22T07:00:00Z",
            data = SleepItemDto(trackedSleepTime = 7.5, score = 86.0),
        )

    private fun event(
        kind: String,
        notes: List<EventNoteDto>,
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
        notes = notes,
    )
}
