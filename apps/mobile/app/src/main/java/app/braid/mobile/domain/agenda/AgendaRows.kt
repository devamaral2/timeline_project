package app.braid.mobile.domain.agenda

import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard

/** A janela livre que a pessoa toca para planejar; o chat (ticket 12) recebe isto junto com o pedido. */
data class FreeWindow(
    val dayKey: String,
    val startMs: Long,
    val endMs: Long,
    val minutes: Int,
    val endsAtMidnight: Boolean,
)

/** Uma linha do dia: a tarefa ou uma janela de tempo livre, na ordem do relógio. O tempo livre nunca vem da API. */
sealed interface AgendaRow {
    val startMs: Long

    data class Task(
        val card: TaskCard,
        override val startMs: Long,
    ) : AgendaRow

    data class Free(
        val slot: FreeSlot,
    ) : AgendaRow {
        override val startMs: Long get() = slot.startMs

        fun window(dayKey: String) = FreeWindow(dayKey, slot.startMs, slot.endMs, slot.minutes, slot.endsAtMidnight)
    }
}

/**
 * As linhas de um dia (`agendaRowsOf` do web). O tempo livre é só de pessoa: uma tarefa de agente não divide nem
 * encurta uma janela. A tarefa ocupa o relógio do início ao fim planejado (`estimatedFinishAt`); sem fim planejado
 * ela ocupa só o instante do início, e a conclusão real (`finishedAt`) não move a agenda. Só entram as janelas de
 * [MIN_FREE_WINDOW_MINUTES] ou mais. Os cartões chegam já na ordem do início.
 */
fun agendaRowsOf(
    cards: List<TaskCard>,
    dayKey: String,
    showFreeTime: Boolean,
): List<AgendaRow> {
    val tasks =
        cards.map { card ->
            AgendaRow.Task(card, checkNotNull(card.startedAt) { "Cartão da agenda sem início: ${card.id}" }.toEpochMilli())
        }
    val slots =
        if (showFreeTime) {
            val spans =
                tasks
                    .filter { it.card.actor != TaskActor.Agent }
                    .map { TimeSpan(it.startMs, it.card.estimatedFinishAt?.toEpochMilli() ?: it.startMs) }
            freeTimeSlots(spans, dayKey).filter { it.minutes >= MIN_FREE_WINDOW_MINUTES }
        } else {
            emptyList()
        }
    // A ordenação é estável: no mesmo instante a tarefa vem antes da janela, como no web.
    return (tasks + slots.map { AgendaRow.Free(it) }).sortedBy { it.startMs }
}
