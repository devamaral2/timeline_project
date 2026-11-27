package app.braid.mobile.domain.task

import app.braid.mobile.domain.timeline.taskDayKeysOf

/** Tarefas de agente que a agenda nunca mostra (ADR 0021): o passo e o conteúdo guardado. */
private val OFF_AGENDA_KINDS = setOf(TaskKind.Step, TaskKind.SaveContent, TaskKind.SaveContentWithTranscription)

/** Um cartão que entra na agenda: tem início e não é tarefa longa, passo nem conteúdo guardado, mesmo quando a resposta os traz. */
fun TaskCard.isAgendaCard(): Boolean = startedAt != null && !longRunning && kind !in OFF_AGENDA_KINDS

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
