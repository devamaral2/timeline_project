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
        /** `human` ou `agent`; ausente (`null`, que o Retrofit não manda) devolve os dois. */
        @Query("actor") actor: String?,
    ): AgendaPageDto
}
