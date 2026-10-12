package app.braid.mobile.data.notes

import app.braid.mobile.data.dto.CreateNoteInputDto
import app.braid.mobile.data.dto.CreateNoteResponseDto
import app.braid.mobile.data.dto.NoteDto
import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface NotesApi {
    @GET("api/notes")
    suspend fun list(): Response<List<NoteDto>>

    @GET("api/notes/{noteId}")
    suspend fun detail(
        @Path("noteId") noteId: String,
    ): Response<NoteDto>

    @POST("api/notes")
    suspend fun create(
        @Body input: CreateNoteInputDto,
    ): Response<CreateNoteResponseDto>

    @PATCH("api/notes/{noteId}")
    suspend fun update(
        @Path("noteId") noteId: String,
        @Body input: JsonObject,
    ): Response<Unit>

    @DELETE("api/notes/{noteId}")
    suspend fun delete(
        @Path("noteId") noteId: String,
    ): Response<Unit>
}
