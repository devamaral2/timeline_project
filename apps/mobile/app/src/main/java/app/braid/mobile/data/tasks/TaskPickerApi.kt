package app.braid.mobile.data.tasks

import retrofit2.http.GET
import retrofit2.http.Query

/** A busca do seletor de tarefas: a mesma rota da lista, com o limite do web; [actor] nulo traz pessoa e agente. */
interface TaskPickerApi {
    @GET("api/tasks/tracked")
    suspend fun search(
        @Query("q") query: String?,
        @Query("limit") limit: Int,
        @Query("actor") actor: String? = null,
    ): List<TaskCardDto>
}
