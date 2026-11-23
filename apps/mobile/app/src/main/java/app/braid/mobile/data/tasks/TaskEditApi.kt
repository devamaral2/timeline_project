package app.braid.mobile.data.tasks

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Query

/** Criação de tarefa e as sugestões do formulário; a edição é o `PATCH` de [TaskDetailApi]. */
interface TaskEditApi {
    /** `POST /api/tasks` responde 201 `{ taskId }`; o corpo é o `CreateTaskInput`. */
    @POST("api/tasks")
    suspend fun create(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject,
    ): CreatedTaskDto

    @GET("api/tags")
    suspend fun tags(
        @Query("query") query: String,
        @Query("limit") limit: Int,
    ): List<TagSuggestionDto>

    @GET("api/places")
    suspend fun places(
        @Query("query") query: String,
        @Query("limit") limit: Int,
    ): List<PlaceSuggestionDto>
}

@Serializable
data class CreatedTaskDto(
    val taskId: String,
)

@Serializable
data class TagSuggestionDto(
    val id: String,
    val name: String,
)

@Serializable
data class PlaceSuggestionDto(
    val name: String,
    val address: String,
    val label: String,
)
