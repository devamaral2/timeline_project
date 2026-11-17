package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.CreateTask
import app.braid.mobile.domain.task.InvalidInputException
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.TaskChanges
import app.braid.mobile.domain.task.TaskEditRepository
import app.braid.mobile.domain.task.TaskPatch
import retrofit2.HttpException
import javax.inject.Inject

class DefaultTaskEditRepository
    @Inject
    constructor(
        private val edit: TaskEditApi,
        private val detail: TaskDetailApi,
        private val changes: TaskChanges = TaskChanges(),
    ) : TaskEditRepository {
        override suspend fun create(
            task: CreateTask,
            idempotencyKey: String,
        ): String =
            try {
                edit.create(idempotencyKey, task.toBody()).taskId.also { changes.notifyChanged() }
            } catch (failure: HttpException) {
                throw refused(failure) ?: failure
            }

        override suspend fun update(
            taskId: String,
            patch: TaskPatch,
        ) {
            try {
                detail.update(taskId, patch.toBody())
                changes.notifyChanged()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_CONFLICT) throw StaleRevisionException(failure)
                throw refused(failure) ?: failure
            }
        }

        override suspend fun tagSuggestions(
            query: String,
            limit: Int,
        ): List<String> = edit.tags(query, limit).map { it.name }

        override suspend fun placeSuggestions(
            query: String,
            limit: Int,
        ): List<String> = edit.places(query, limit).map { it.label }

        private fun refused(failure: HttpException): InvalidInputException? =
            if (failure.code() == HTTP_BAD_REQUEST || failure.code() == HTTP_UNPROCESSABLE) InvalidInputException(failure) else null

        private companion object {
            const val HTTP_BAD_REQUEST = 400
            const val HTTP_CONFLICT = 409
            const val HTTP_UNPROCESSABLE = 422
        }
    }
