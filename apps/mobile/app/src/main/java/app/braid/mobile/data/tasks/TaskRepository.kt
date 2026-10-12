package app.braid.mobile.data.tasks

import app.braid.mobile.data.dto.CreateTaskInputDto
import app.braid.mobile.data.dto.CreateTaskResponseDto
import app.braid.mobile.data.dto.TaskSummaryDto
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

sealed interface TaskResult<out T> {
    data class Success<T>(
        val value: T,
    ) : TaskResult<T>

    /** `status` é o HTTP da resposta; `null` quando a rede falhou. */
    data class Failure(
        val status: Int? = null,
    ) : TaskResult<Nothing>
}

interface TaskGateway {
    suspend fun list(): TaskResult<List<TaskSummaryDto>>

    suspend fun create(input: CreateTaskInputDto): TaskResult<CreateTaskResponseDto>
}

@Singleton
class TaskRepository
    @Inject
    constructor(
        private val api: TasksApi,
    ) : TaskGateway {
        override suspend fun list(): TaskResult<List<TaskSummaryDto>> = call { api.list() }

        override suspend fun create(input: CreateTaskInputDto): TaskResult<CreateTaskResponseDto> = call { api.create(input) }

        private suspend fun <T : Any> call(request: suspend () -> Response<T>): TaskResult<T> {
            val response =
                try {
                    request()
                } catch (_: IOException) {
                    return TaskResult.Failure()
                }
            if (!response.isSuccessful) return TaskResult.Failure(response.code())
            val body = response.body() ?: return TaskResult.Failure(502)
            return TaskResult.Success(body)
        }
    }
