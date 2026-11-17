package app.braid.mobile.domain.task

import java.time.Instant

enum class RequestRelation { Generates, Updates }

/** Um pedido ao agente que criou ou alterou a tarefa; [id] é a tarefa do pedido, que abre o detalhe dele. */
data class TaskRequest(
    val id: String,
    val name: String,
    val relation: RequestRelation,
    val at: Instant,
)

/**
 * A tarefa do detalhe (`TaskDto`): o [card] que as listas leem mais o que só o detalhe mostra. Os documentos
 * (`artifacts`) vêm junto.
 */
data class TaskDetail(
    val card: TaskCard,
    val priority: TaskPriority,
    val description: String,
    val location: String?,
    val finishedAt: Instant?,
    val notifyOffsetsMinutes: List<Int>,
    val parentTaskId: String?,
    val recurrence: TaskRecurrence?,
    val subtaskIds: List<String>,
    val requests: List<TaskRequest>,
    /** Os documentos ligados, na ordem da API (ticket 16). */
    val artifacts: List<TaskArtifact> = emptyList(),
) {
    val id: String get() = card.id
    val actor: TaskActor get() = card.actor
    val status: TaskStatus? get() = card.status

    /** Só a tarefa de pessoa com status mostra e troca status e prioridade no topo; a de referência e a de agente não. */
    val hasHumanControls: Boolean get() = card.actor == TaskActor.Human && card.status != null
}
