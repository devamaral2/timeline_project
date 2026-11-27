package app.braid.mobile.data.tasks

import app.braid.mobile.data.http.HTTP_CONFLICT
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.StatusPatch
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskChanges
import app.braid.mobile.domain.task.TaskFilters
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.domain.task.trackedQuery
import app.braid.mobile.domain.timeline.toIsoMillis
import retrofit2.HttpException
import java.time.Instant
import javax.inject.Inject

class DefaultTaskRepository
    @Inject
    constructor(
        private val api: TasksApi,
        private val changes: TaskChanges = TaskChanges(),
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

        override suspend fun tracked(
            filters: TaskFilters,
            actor: TaskActor?,
        ): List<TaskCard> {
            val query = trackedQuery(filters)
            return api
                .tracked(actor?.code, query.priorities.takeIf { it.isNotEmpty() }?.joinToString(",") { it.code }, query.tag, query.query)
                .map(TaskCardDto::toDomain)
        }

        override suspend fun setSituation(
            taskId: String,
            situation: TaskSituation,
        ) {
            api.setSituation(taskId, SetSituationBody(situation.code))
        }

        override suspend fun changeStatus(
            taskId: String,
            patch: StatusPatch,
        ) {
            try {
                api.update(taskId, patch.toBody())
                changes.notifyChanged()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_CONFLICT) throw StaleRevisionException(failure)
                throw failure
            }
        }
    }
