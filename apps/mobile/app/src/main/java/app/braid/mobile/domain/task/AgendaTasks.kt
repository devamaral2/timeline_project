package app.braid.mobile.domain.task

import app.braid.mobile.domain.timeline.taskDayKeysOf

/** Um cartão que entra na agenda: tem início e não é tarefa longa nem passo, mesmo quando a resposta os traz. */
fun TaskCard.isAgendaCard(): Boolean = startedAt != null && !longRunning && kind != TaskKind.Step

/**
 * Agrupa e ordena os cartões por dia. Uma tarefa que atravessa a meia-noite
 * aparece no dia em que começou e no dia em que termina; ids repetidos entre
 * páginas valem uma vez; dentro do dia a ordem é início e depois id.
 */
fun agendaTasksByDay(cards: List<TaskCard>): Map<String, List<TaskCard>> {
    val byDay = mutableMapOf<String, MutableList<TaskCard>>()
    val seen = mutableSetOf<String>()
    for (card in cards) {
        if (!seen.add(card.id) || !card.isAgendaCard()) continue
        val startedAt = checkNotNull(card.startedAt)
        for (dayKey in taskDayKeysOf(startedAt, card.estimatedFinishAt)) {
            byDay.getOrPut(dayKey) { mutableListOf() }.add(card)
        }
    }
    return byDay.mapValues { (_, dayCards) ->
        dayCards.sortedWith(compareBy<TaskCard> { it.startedAt }.thenBy { it.id })
    }
}
