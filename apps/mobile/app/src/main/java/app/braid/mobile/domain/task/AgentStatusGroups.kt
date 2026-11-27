package app.braid.mobile.domain.task

/*
 * Os quatro grupos de status de agente, num lugar só: o chat, as barras de edição por IA e de arquivo de agente, a tela
 * da tarefa de agente, os lembretes e a gaveta de subtarefas perguntam a eles em vez de comparar com `Done` e `Cancel`.
 * É a cópia, no app, de `apps/api/src/domain/agent-status.ts`. Trocar os valores de agente é trocar estes conjuntos.
 */

/** O pedido ainda não terminou: espera, roda ou aguarda a pessoa. */
val OPEN_AGENT_STATUSES: Set<TaskStatus> = setOf(TaskStatus.Queued, TaskStatus.Running, TaskStatus.Waiting)

/** O pedido anda sozinho: na fila ou rodando, sem esperar a pessoa. */
val IN_PROGRESS_AGENT_STATUSES: Set<TaskStatus> = setOf(TaskStatus.Queued, TaskStatus.Running)

/** O pedido terminou, de qualquer jeito. */
val FINAL_AGENT_STATUSES: Set<TaskStatus> = setOf(TaskStatus.Done, TaskStatus.Failed, TaskStatus.Cancel)

/** O pedido terminou e entregou o que devia. */
val SUCCESS_AGENT_STATUSES: Set<TaskStatus> = setOf(TaskStatus.Done)

fun isOpenAgentStatus(status: TaskStatus?): Boolean = status in OPEN_AGENT_STATUSES

fun isInProgressAgentStatus(status: TaskStatus?): Boolean = status in IN_PROGRESS_AGENT_STATUSES

fun isFinalAgentStatus(status: TaskStatus?): Boolean = status in FINAL_AGENT_STATUSES

fun isSuccessAgentStatus(status: TaskStatus?): Boolean = status in SUCCESS_AGENT_STATUSES

/*
 * As perguntas que servem aos dois executores: recebem o executor, e o que cada um responde sai dos grupos de agente ou
 * dos status de pessoa daqui.
 */

private val HUMAN_SILENCING_STATUSES = setOf(TaskStatus.Done, TaskStatus.Cancel)
private val AGENT_SILENCING_STATUSES = SUCCESS_AGENT_STATUSES + TaskStatus.Cancel
private val HUMAN_CLOSED_STATUSES = setOf(TaskStatus.Done, TaskStatus.Cancel, TaskStatus.Missed)
private val HUMAN_DONE_STATUSES = setOf(TaskStatus.Done)

/** Um cartão feito ou cancelado já não lembra ninguém. */
fun silencesReminder(
    actor: TaskActor,
    status: TaskStatus?,
): Boolean = status in (if (actor == TaskActor.Agent) AGENT_SILENCING_STATUSES else HUMAN_SILENCING_STATUSES)

/** A subtarefa já não pede nada: o executor terminou com ela, bem ou mal. */
fun isSubtaskClosed(
    actor: TaskActor,
    status: TaskStatus?,
): Boolean = status in (if (actor == TaskActor.Agent) FINAL_AGENT_STATUSES else HUMAN_CLOSED_STATUSES)

/** A subtarefa conta na fração "n de m feitas". */
fun isSubtaskDone(
    actor: TaskActor,
    status: TaskStatus?,
): Boolean = status in (if (actor == TaskActor.Agent) SUCCESS_AGENT_STATUSES else HUMAN_DONE_STATUSES)
