package app.braid.mobile.data.reminders

import app.braid.mobile.data.events.EventQuery
import app.braid.mobile.data.events.EventRepository
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.data.tasks.TaskGateway
import app.braid.mobile.data.tasks.TaskResult
import java.time.Duration
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * `complete` é falso quando a lista de eventos ou a de tarefas falhou: quem
 * sincroniza alarmes não deve apagar os que já existem com base num
 * resultado parcial.
 */
data class NotificationSources(
    val sources: List<NotificationFeedSource>,
    val complete: Boolean,
)

/**
 * Os eventos e tarefas que ainda podem avisar: o que começa entre as últimas
 * 24h (para a lista do sino) e os próximos 30 dias (o maior aviso possível).
 */
@Singleton
class NotificationSourceLoader
    @Inject
    constructor(
        private val events: EventRepository,
        private val tasks: TaskGateway,
    ) {
        suspend fun load(now: Instant = Instant.now()): NotificationSources {
            val fromEvents = loadEvents(now)
            val fromTasks = loadTasks(now)
            return NotificationSources(
                sources = fromEvents.first + fromTasks.first,
                complete = fromEvents.second && fromTasks.second,
            )
        }

        private suspend fun loadEvents(now: Instant): Pair<List<NotificationFeedSource>, Boolean> {
            val sources = mutableListOf<NotificationFeedSource>()
            var cursor: String? = null
            repeat(MAX_PAGES) {
                val page =
                    when (
                        val result =
                            events.window(
                                from = now.minus(NOTIFICATION_FEED_HISTORY),
                                to = now.plus(LOOK_AHEAD),
                                query = EventQuery(limit = PAGE_LIMIT, cursor = cursor),
                                forceRefresh = true,
                            )
                    ) {
                        is EventResult.Success -> result.value
                        is EventResult.Failure -> return sources to false
                    }
                page.items.forEach { event ->
                    if (event.notifyOffsetsMinutes.isEmpty()) return@forEach
                    val startedAt = runCatching { Instant.parse(event.startedAt) }.getOrNull() ?: return@forEach
                    sources +=
                        NotificationFeedSource(
                            kind = NotificationKind.Event,
                            id = event.id,
                            name = event.name,
                            startedAt = startedAt,
                            notifyOffsetsMinutes = event.notifyOffsetsMinutes,
                        )
                }
                cursor = page.nextCursor
                if (cursor == null) return sources to true
            }
            return sources to true
        }

        private suspend fun loadTasks(now: Instant): Pair<List<NotificationFeedSource>, Boolean> {
            val list =
                when (val result = tasks.list()) {
                    is TaskResult.Success -> result.value
                    is TaskResult.Failure -> return emptyList<NotificationFeedSource>() to false
                }
            val earliest = now.minus(NOTIFICATION_FEED_HISTORY)
            val sources =
                list.mapNotNull { task ->
                    if (task.status == "done" || task.status == "cancel") return@mapNotNull null
                    if (task.notifyOffsetsMinutes.isEmpty()) return@mapNotNull null
                    val startedAt =
                        task.startedAt?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return@mapNotNull null
                    if (startedAt.isBefore(earliest)) return@mapNotNull null
                    NotificationFeedSource(
                        kind = NotificationKind.Task,
                        id = task.id,
                        name = task.name,
                        startedAt = startedAt,
                        notifyOffsetsMinutes = task.notifyOffsetsMinutes,
                    )
                }
            return sources to true
        }

        private companion object {
            val LOOK_AHEAD: Duration = Duration.ofDays(31)
            const val PAGE_LIMIT = 100
            const val MAX_PAGES = 10
        }
    }
