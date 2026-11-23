package app.braid.mobile.data.tasks

import retrofit2.http.GET
import retrofit2.http.Query

/** A busca do seletor de tarefas: a mesma rota da lista, com o limite do web. */
interface TaskPickerApi {
    @GET("api/tasks/tracked")
    suspend fun search(
        @Query("q") query: String?,
        @Query("limit") limit: Int,
    ): List<TaskCardDto>
}
