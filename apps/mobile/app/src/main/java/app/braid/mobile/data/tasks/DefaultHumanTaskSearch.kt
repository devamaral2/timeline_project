package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.HumanTaskSearch
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.task.mergeHumanTaskChoices
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.shiftDayKey
import app.braid.mobile.domain.timeline.zonedDayEnd
import app.braid.mobile.domain.timeline.zonedDayStart
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import javax.inject.Inject

/** Quantos dias antes e depois de hoje a agenda entra na busca, como o web (`NEARBY_DAYS`). */
const val NEARBY_DAYS = 14

/** Por quanto tempo a agenda lida vale para as próximas buscas da mesma folha, como o web (`NEARBY_TTL_MS`). */
const val NEARBY_TTL_MILLIS = 60_000L

/**
 * A busca de tarefas de pessoa do seletor de tarefas do artefato: `GET /api/tasks/tracked?actor=human&q=&limit=50` e a
 * agenda de pessoa de 14 dias antes a 14 dias depois de hoje, lida uma vez e reaproveitada por um minuto enquanto a
 * pessoa digita. A leitura da agenda que falha não fica guardada: a próxima busca tenta de novo.
 */
class DefaultHumanTaskSearch
    @Inject
    constructor(
        private val api: TaskPickerApi,
        private val tasks: TaskRepository,
        private val clock: AppClock,
    ) : HumanTaskSearch {
        private val lock = Mutex()
        private var nearby: Pair<Instant, List<TaskCard>>? = null

        override suspend fun search(query: String): List<TaskCard> =
            coroutineScope {
                val agenda = async { nearbyAgenda() }
                val tracked = api.search(query.ifEmpty { null }, PICKER_LIMIT, TaskActor.Human.code).map(TaskCardDto::toDomain)
                mergeHumanTaskChoices(query, tracked, agenda.await())
            }

        private suspend fun nearbyAgenda(): List<TaskCard> =
            lock.withLock {
                val now = clock.now()
                nearby?.let { (at, cards) -> if (now.toEpochMilli() - at.toEpochMilli() < NEARBY_TTL_MILLIS) return@withLock cards }
                val today = dayKeyOf(now)
                try {
                    tasks
                        .agenda(
                            from = zonedDayStart(shiftDayKey(today, -NEARBY_DAYS)),
                            to = zonedDayEnd(shiftDayKey(today, NEARBY_DAYS)),
                            actor = TaskActor.Human,
                        ).also { nearby = now to it }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    nearby = null
                    emptyList()
                }
            }
    }
