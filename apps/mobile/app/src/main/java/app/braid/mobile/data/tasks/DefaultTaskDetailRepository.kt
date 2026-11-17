package app.braid.mobile.data.tasks

import app.braid.mobile.data.http.HTTP_CONFLICT
import app.braid.mobile.data.http.HTTP_FORBIDDEN
import app.braid.mobile.data.http.HTTP_NOT_FOUND
import app.braid.mobile.domain.task.ArtifactLink
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.StatusPatch
import app.braid.mobile.domain.task.TaskChanges
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskDetailRepository
import app.braid.mobile.domain.task.TaskNotFoundException
import app.braid.mobile.domain.task.TaskPatch
import app.braid.mobile.domain.task.TaskPriority
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import retrofit2.HttpException
import javax.inject.Inject

class DefaultTaskDetailRepository
    @Inject
    constructor(
        private val api: TaskDetailApi,
        private val changes: TaskChanges = TaskChanges(),
    ) : TaskDetailRepository {
        override suspend fun task(id: String): TaskDetail =
            try {
                api.task(id).toDomain()
            } catch (failure: HttpException) {
                // A tarefa de outro usuário responde 403 e a que não existe 404: a tela diz só que não há tarefa.
                if (failure.code() == HTTP_NOT_FOUND || failure.code() == HTTP_FORBIDDEN) throw TaskNotFoundException(failure)
                throw failure
            }

        override suspend fun changeStatus(
            taskId: String,
            patch: StatusPatch,
        ) {
            update(taskId, patch.toBody())
        }

        override suspend fun changePriority(
            taskId: String,
            expectedRevision: Int,
            priority: TaskPriority,
        ) {
            update(
                taskId,
                buildJsonObject {
                    put("expectedRevision", expectedRevision)
                    put("priority", priority.code)
                },
            )
        }

        override suspend fun changeArtifacts(
            taskId: String,
            expectedRevision: Int,
            links: List<ArtifactLink>,
        ) {
            update(taskId, TaskPatch(expectedRevision = expectedRevision, artifacts = links).toBody())
        }

        override suspend fun delete(taskId: String) {
            try {
                api.delete(taskId)
                changes.notifyChanged()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_NOT_FOUND) throw TaskNotFoundException(failure)
                throw failure
            }
        }

        private suspend fun update(
            taskId: String,
            body: JsonObject,
        ) {
            try {
                api.update(taskId, body)
                changes.notifyChanged()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_CONFLICT) throw StaleRevisionException(failure)
                throw failure
            }
        }
    }
