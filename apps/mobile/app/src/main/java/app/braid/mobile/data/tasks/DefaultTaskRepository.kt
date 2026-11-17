package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.StatusPatch
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.timeline.toIsoMillis
import retrofit2.HttpException
import java.time.Instant
import javax.inject.Inject

class DefaultTaskRepository
    @Inject
    constructor(
        private val api: TasksApi,
    ) : TaskRepository {
        override suspend fun agenda(
            from: Instant,
            to: Instant,
            actor: TaskActor?,
        ): List<TaskCard> {
            val cards = LinkedHashMap<String, TaskCard>()
            var cursor: String? = null
            do {
                val page = api.agenda(toIsoMillis(from), toIsoMillis(to), cursor, actor?.code)
                for (item in page.items) cards.putIfAbsent(item.id, item.toDomain())
                cursor = page.nextCursor
            } while (cursor != null)
            return cards.values.toList()
        }

        override suspend fun changeStatus(
            taskId: String,
            patch: StatusPatch,
        ) {
            try {
                api.update(taskId, patch.toBody())
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_CONFLICT) throw StaleRevisionException(failure)
                throw failure
            }
        }

        private companion object {
            const val HTTP_CONFLICT = 409
        }
    }
