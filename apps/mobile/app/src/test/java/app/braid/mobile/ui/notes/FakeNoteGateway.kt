package app.braid.mobile.ui.notes

import app.braid.mobile.data.dto.CreateNoteInputDto
import app.braid.mobile.data.dto.CreateNoteResponseDto
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.UpdateNoteInput
import app.braid.mobile.data.notes.NoteErrorKind
import app.braid.mobile.data.notes.NoteGateway
import app.braid.mobile.data.notes.NoteRepositoryError
import app.braid.mobile.data.notes.NoteResult
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal val unavailable = NoteResult.Failure(NoteRepositoryError(NoteErrorKind.Unavailable))

internal fun sampleNote(
    id: String = "note-1",
    revision: Int = 1,
    name: String = "Livros para ler",
) = NoteDto(
    id = id,
    name = name,
    type = "text",
    schemaVersion = 1,
    data = JsonObject(mapOf("body" to JsonPrimitive("Torto arado."))),
    links = emptyList(),
    tags = emptyList(),
    revision = revision,
    createdAt = "2026-09-11T12:00:00Z",
    updatedAt = "2026-09-11T12:00:00Z",
)

internal class FakeNoteGateway(
    var listResult: NoteResult<List<NoteDto>> = NoteResult.Success(emptyList()),
    var detailResults: MutableList<NoteResult<NoteDto>> = mutableListOf(),
    var createResult: NoteResult<CreateNoteResponseDto> = NoteResult.Success(CreateNoteResponseDto("note-new")),
    var updateResult: NoteResult<Unit> = NoteResult.Success(Unit),
    var deleteResult: NoteResult<Unit> = NoteResult.Success(Unit),
) : NoteGateway {
    val created = mutableListOf<CreateNoteInputDto>()
    val updated = mutableListOf<Pair<String, UpdateNoteInput>>()
    val deleted = mutableListOf<String>()

    override suspend fun list() = listResult

    override suspend fun detail(noteId: String): NoteResult<NoteDto> = detailResults.removeFirstOrNull() ?: unavailable

    override suspend fun create(input: CreateNoteInputDto): NoteResult<CreateNoteResponseDto> {
        created += input
        return createResult
    }

    override suspend fun update(
        noteId: String,
        input: UpdateNoteInput,
    ): NoteResult<Unit> {
        updated += noteId to input
        return updateResult
    }

    override suspend fun delete(noteId: String): NoteResult<Unit> {
        deleted += noteId
        return deleteResult
    }
}
