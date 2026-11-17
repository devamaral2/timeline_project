package app.braid.mobile.domain.task

import java.time.Instant

/** A prioridade da tarefa de pessoa, na ordem do seletor: da mais alta para a mais baixa. */
enum class TaskPriority(
    val code: String,
    val label: String,
) {
    Urgent("urgent", "Urgente"),
    High("high", "Alta"),
    Medium("medium", "Média"),
    Low("low", "Baixa"),
    ;

    companion object {
        fun fromCode(code: String): TaskPriority = entries.firstOrNull { it.code == code } ?: error("Prioridade desconhecida: $code")
    }
}

enum class RecurrenceFrequency(
    val code: String,
) {
    Daily("daily"),
    Weekly("weekly"),
    Monthly("monthly"),
    Yearly("yearly"),
    ;

    companion object {
        fun fromCode(code: String): RecurrenceFrequency = entries.firstOrNull { it.code == code } ?: error("Frequência desconhecida: $code")
    }
}

/** A regra da série: [byWeekday] é a máscara de bits da semana (bit 0 = domingo); as datas são dias civis `YYYY-MM-DD`. */
data class RecurrenceRule(
    val frequency: RecurrenceFrequency,
    val interval: Int,
    val byWeekday: Int?,
    val byMonthDay: Int?,
    val byMonth: Int?,
    val timeOfDay: String,
    val startsOn: String,
    val endsOn: String?,
)

/** A série de que a tarefa é uma ocorrência; [detached] diz que alguém a editou e ela deixou de seguir a série. */
data class TaskRecurrence(
    val id: String,
    val occurrenceOn: String,
    val detached: Boolean,
    val rule: RecurrenceRule,
)

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
 * (`artifacts`) ficam para o ticket 16.
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
) {
    val id: String get() = card.id
    val actor: TaskActor get() = card.actor
    val status: TaskStatus? get() = card.status

    /** Só a tarefa de pessoa com status mostra e troca status e prioridade no topo; a de referência e a de agente não. */
    val hasHumanControls: Boolean get() = card.actor == TaskActor.Human && card.status != null
}
