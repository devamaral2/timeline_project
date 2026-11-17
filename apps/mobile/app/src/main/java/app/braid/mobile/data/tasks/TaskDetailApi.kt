package app.braid.mobile.data.tasks

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path

interface TaskDetailApi {
    @GET("api/tasks/{id}")
    suspend fun task(
        @Path("id") id: String,
    ): TaskDetailDto

    /** `PATCH /api/tasks/{id}` responde 204; o corpo é o `UpdateTaskInput` sem o id. */
    @PATCH("api/tasks/{id}")
    suspend fun update(
        @Path("id") id: String,
        @Body body: JsonObject,
    )

    /** `DELETE /api/tasks/{id}` responde 204. */
    @DELETE("api/tasks/{id}")
    suspend fun delete(
        @Path("id") id: String,
    )
}
