package app.braid.mobile.data.tasks

import app.braid.mobile.data.dto.CreateTaskInputDto
import app.braid.mobile.data.dto.CreateTaskResponseDto
import app.braid.mobile.data.dto.TaskSummaryDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface TasksApi {
    @GET("api/tasks")
    suspend fun list(): Response<List<TaskSummaryDto>>

    @POST("api/tasks")
    suspend fun create(
        @Body input: CreateTaskInputDto,
    ): Response<CreateTaskResponseDto>
}
