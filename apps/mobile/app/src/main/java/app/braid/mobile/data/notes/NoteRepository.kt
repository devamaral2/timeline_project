package app.braid.mobile.data.notes

import app.braid.mobile.data.dto.CreateNoteInputDto
import app.braid.mobile.data.dto.CreateNoteResponseDto
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.UpdateNoteInput
import app.braid.mobile.data.dto.toJsonObject
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

enum class NoteErrorKind {
    Unavailable,
    Http,
    Protocol,
}

data class NoteRepositoryError(
    val kind: NoteErrorKind,
    val status: Int? = null,
)

sealed interface NoteResult<out T> {
    data class Success<T>(
        val value: T,
    ) : NoteResult<T>

    data class Failure(
        val error: NoteRepositoryError,
    ) : NoteResult<Nothing>
}

interface NoteGateway {
    suspend fun list(): NoteResult<List<NoteDto>>

    suspend fun detail(noteId: String): NoteResult<NoteDto>

    suspend fun create(input: CreateNoteInputDto): NoteResult<CreateNoteResponseDto>

    suspend fun update(
        noteId: String,
        input: UpdateNoteInput,
    ): NoteResult<Unit>

    suspend fun delete(noteId: String): NoteResult<Unit>
}

@Singleton
class NoteRepository
    @Inject
    constructor(
        private val api: NotesApi,
    ) : NoteGateway {
        override suspend fun list(): NoteResult<List<NoteDto>> = call { api.list() }

        override suspend fun detail(noteId: String): NoteResult<NoteDto> = call { api.detail(noteId) }

        override suspend fun create(input: CreateNoteInputDto): NoteResult<CreateNoteResponseDto> = call { api.create(input) }

        override suspend fun update(
            noteId: String,
            input: UpdateNoteInput,
        ): NoteResult<Unit> = callWithoutBody { api.update(noteId, input.toJsonObject()) }

        override suspend fun delete(noteId: String): NoteResult<Unit> = callWithoutBody { api.delete(noteId) }

        /** PATCH e DELETE respondem 204: não há corpo para ler. */
        private suspend fun callWithoutBody(request: suspend () -> Response<Unit>): NoteResult<Unit> {
            val response =
                try {
                    request()
                } catch (_: IOException) {
                    return NoteResult.Failure(NoteRepositoryError(NoteErrorKind.Unavailable))
                }
            if (!response.isSuccessful) {
                return NoteResult.Failure(NoteRepositoryError(NoteErrorKind.Http, response.code()))
            }
            return NoteResult.Success(Unit)
        }

        private suspend fun <T : Any> call(request: suspend () -> Response<T>): NoteResult<T> {
            val response =
                try {
                    request()
                } catch (_: IOException) {
                    return NoteResult.Failure(NoteRepositoryError(NoteErrorKind.Unavailable))
                }
            if (!response.isSuccessful) {
                return NoteResult.Failure(NoteRepositoryError(NoteErrorKind.Http, response.code()))
            }
            val body = response.body() ?: return NoteResult.Failure(NoteRepositoryError(NoteErrorKind.Protocol, 502))
            return NoteResult.Success(body)
        }
    }
