package app.braid.mobile.domain.assistant

import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.momentLabel
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.domain.timeline.zonedDayStart

/**
 * Quando acontece a tarefa que o assistente acabou de criar ou alterar, para o cartão da resposta: "Qui, 26 nov · 15:00 —
 * 16:00". O fim só entra com hora marcada e no mesmo dia do início; o dia sem hora sai só com a data, a tarefa longa com o
 * prazo, e a tarefa sem data não tem linha.
 */
fun recordWhenLabel(card: TaskCard): String? {
    if (card.longRunning) return card.estimatedFinishAt?.let { "Prazo ${momentLabel(it)}" }
    val start = card.startedAt ?: return null
    val label = momentLabel(start)
    val end = card.estimatedFinishAt ?: return label
    val day = dayKeyOf(start)
    val timed = start != zonedDayStart(day)
    return if (timed && end > start && dayKeyOf(end) == day) "$label — ${formatTime(end)}" else label
}
