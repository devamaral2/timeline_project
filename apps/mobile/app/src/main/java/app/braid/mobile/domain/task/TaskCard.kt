package app.braid.mobile.domain.task

import java.time.Instant

/** Quem executa a tarefa: a pessoa ou um agente. */
enum class TaskActor(
    /** O valor do filtro `actor` da API e do contrato. */
    val code: String,
) {
    Human("human"),
    Agent("agent"),
}

/** O tipo da tarefa; [code] é o nome que o contrato usa e que a linha escreve em mono. */
enum class TaskKind(
    val code: String,
) {
    Common("common"),
    Meal("meal"),
    Sleep("sleep"),
    Training("training"),
    Request("request"),
    SearchRequest("search_request"),
    BuildRequest("build_request"),
    InquiryRequest("inquiry_request"),
    ReviewRequest("review_request"),
    Cron("cron"),
    Step("step"),
    ;

    companion object {
        fun fromCode(code: String): TaskKind = entries.firstOrNull { it.code == code } ?: error("Tipo de tarefa desconhecido: $code")
    }
}

/** Os status das duas pontas; `Done` e `Cancel` valem para pessoa e agente, o resto para uma só. */
enum class TaskStatus(
    val code: String,
) {
    Todo("todo"),
    ToDefine("toDefine"),
    Doing("doing"),
    InHold("inHold"),
    Done("done"),
    Cancel("cancel"),
    Missed("missed"),
    Queued("queued"),
    Running("running"),
    Waiting("waiting"),
    Failed("failed"),
    ;

    companion object {
        fun fromCode(code: String): TaskStatus = entries.firstOrNull { it.code == code } ?: error("Status de tarefa desconhecido: $code")
    }
}

/** A prioridade da tarefa, da mais alta à mais baixa: a ordem do enum é a ordem do filtro e do parâmetro `priority`. */
enum class TaskPriority(
    val code: String,
    /** O rótulo da tela. */
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

/** A regra de uma série; [byWeekday] é a máscara de dias (bit 0 = domingo) e as datas são dias civis `YYYY-MM-DD`. */
data class RecurrenceRule(
    val frequency: RecurrenceFrequency,
    val interval: Int,
    val byWeekday: Int?,
    val byMonthDay: Int?,
    val byMonth: Int?,
    val timeOfDay: String,
    val startsOn: String,
    val endsOn: String? = null,
)

/** A ocorrência de uma série em que o cartão está; [detached] é a que já não segue a regra. */
data class TaskRecurrence(
    val id: String,
    val occurrenceOn: String,
    val detached: Boolean,
    val rule: RecurrenceRule,
)

/**
 * O cartão de tarefa do contrato, do jeito que as listas o leem. Tarefa de pessoa
 * sem [status] é a tarefa de referência ("Só agenda"). Passos, tarefas longas e
 * tarefas sem início não entram na agenda.
 */
data class TaskCard(
    val id: String,
    val actor: TaskActor,
    val kind: TaskKind,
    val status: TaskStatus?,
    val name: String,
    val startedAt: Instant?,
    val estimatedFinishAt: Instant?,
    val longRunning: Boolean,
    val tags: List<String>,
    val revision: Int,
    val priority: TaskPriority = TaskPriority.Medium,
    val recurrence: TaskRecurrence? = null,
)
