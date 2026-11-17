package app.braid.mobile.domain.reminder

import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskFilters
import app.braid.mobile.domain.task.TaskRepository
import kotlinx.coroutines.CancellationException
import java.time.Instant

/**
 * As tarefas de que os lembretes saem: [cards] sem repetir (a agenda vence a lista de acompanhadas, como no web) e
 * [complete], falso quando só uma das duas listas respondeu.
 */
data class ReminderSources(
    val cards: List<TaskCard>,
    val complete: Boolean,
)

/**
 * A fonte única dos alarmes (ticket 22) e do feed do chat (ticket 23): a agenda das últimas 24 h aos próximos 31 dias e a
 * lista de acompanhadas. Falha de uma lista é engolida (um aviso a menos); `null` quando nenhuma respondeu.
 */
suspend fun loadReminderSources(
    tasks: TaskRepository,
    now: Instant,
): ReminderSources? {
    val agenda = attempt { tasks.agenda(now.minus(LOOK_BEHIND), now.plus(LOOK_AHEAD)) }
    val tracked = attempt { tasks.tracked(TaskFilters()) }
    if (agenda == null && tracked == null) return null

    val cards = LinkedHashMap<String, TaskCard>()
    for (card in agenda.orEmpty() + tracked.orEmpty()) cards.putIfAbsent(card.id, card)
    return ReminderSources(cards.values.toList(), complete = agenda != null && tracked != null)
}

/** Roda [block]; qualquer falha vira `null`, menos o cancelamento da corrotina, que continua subindo. */
internal suspend fun <T> attempt(block: suspend () -> T): T? =
    try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }
