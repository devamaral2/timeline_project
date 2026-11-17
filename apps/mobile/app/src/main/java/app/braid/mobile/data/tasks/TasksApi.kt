package app.braid.mobile.data.tasks

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

interface TasksApi {
    /** `from` e `to` são instantes ISO com milissegundos, os mesmos que o web manda. */
    @GET("api/tasks")
    suspend fun agenda(
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("cursor") cursor: String?,
        /** `human` ou `agent`; ausente (`null`, que o Retrofit não manda) devolve os dois. */
        @Query("actor") actor: String?,
    ): AgendaPageDto

    /** `PATCH /api/tasks/{id}` responde 204; o corpo é o `UpdateTaskInput` sem o id. */
    @PATCH("api/tasks/{id}")
    suspend fun update(
        @Path("id") id: String,
        @Body body: JsonObject,
    )
}
