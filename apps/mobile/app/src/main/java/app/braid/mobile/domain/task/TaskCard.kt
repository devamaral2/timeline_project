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
)
