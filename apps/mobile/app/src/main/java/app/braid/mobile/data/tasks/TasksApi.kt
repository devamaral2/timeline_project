package app.braid.mobile.data.tasks

import retrofit2.http.GET
import retrofit2.http.Query

interface TasksApi {
    /** `from` e `to` são instantes ISO com milissegundos, os mesmos que o web manda. */
    @GET("api/tasks")
    suspend fun agenda(
        @Query("from") from: String,
        @Query("to") to: String,
        @Query("cursor") cursor: String?,
    ): AgendaPageDto
}
