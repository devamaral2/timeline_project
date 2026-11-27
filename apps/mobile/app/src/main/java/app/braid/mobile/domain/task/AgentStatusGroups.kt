package app.braid.mobile.domain.task

/*
 * Os quatro grupos de status de agente, num lugar só: o chat, as barras de edição por IA e de arquivo de agente, a tela
 * da tarefa de agente, os lembretes e a gaveta de subtarefas perguntam a eles em vez de comparar com um status só.
 * É a cópia, no app, de `apps/api/src/domain/agent-status.ts`. Trocar os valores de agente é trocar estes conjuntos.
 */

/** O pedido ainda não terminou: espera, roda ou aguarda a pessoa. */
val OPEN_AGENT_STATUSES: Set<TaskStatus> =
    setOf(
        TaskStatus.Preparing,
        TaskStatus.Queued,
        TaskStatus.Starting,
        TaskStatus.Running,
        TaskStatus.Waiting,
        TaskStatus.AwaitingTranscription,
    )

/** O pedido anda sozinho: sendo preparado, na fila, iniciando, rodando ou esperando a transcrição, sem esperar a pessoa. */
val IN_PROGRESS_AGENT_STATUSES: Set<TaskStatus> =
    setOf(TaskStatus.Preparing, TaskStatus.Queued, TaskStatus.Starting, TaskStatus.Running, TaskStatus.AwaitingTranscription)

/** O pedido terminou, de qualquer jeito. */
val FINAL_AGENT_STATUSES: Set<TaskStatus> =
    setOf(TaskStatus.Completed, TaskStatus.Interrupted, TaskStatus.Failed, TaskStatus.Cancelled, TaskStatus.RolledBack)

/** O pedido terminou e entregou o que devia. */
val SUCCESS_AGENT_STATUSES: Set<TaskStatus> = setOf(TaskStatus.Completed)

/** A execução parou no meio: pode haver trabalho pela metade. */
val INTERRUPTED_AGENT_STATUSES: Set<TaskStatus> = setOf(TaskStatus.Interrupted)

/** A pessoa cancelou o pedido antes de ele trabalhar. */
val CANCELLED_AGENT_STATUSES: Set<TaskStatus> = setOf(TaskStatus.Cancelled)

fun isOpenAgentStatus(status: TaskStatus?): Boolean = status in OPEN_AGENT_STATUSES

fun isInProgressAgentStatus(status: TaskStatus?): Boolean = status in IN_PROGRESS_AGENT_STATUSES

fun isFinalAgentStatus(status: TaskStatus?): Boolean = status in FINAL_AGENT_STATUSES

fun isSuccessAgentStatus(status: TaskStatus?): Boolean = status in SUCCESS_AGENT_STATUSES

fun isInterruptedAgentStatus(status: TaskStatus?): Boolean = status in INTERRUPTED_AGENT_STATUSES

fun isCancelledAgentStatus(status: TaskStatus?): Boolean = status in CANCELLED_AGENT_STATUSES

/*
 * As perguntas que servem aos dois executores: recebem o executor, e o que cada um responde sai dos grupos de agente ou
 * dos status de pessoa daqui.
 */

private val HUMAN_SILENCING_STATUSES = setOf(TaskStatus.Done, TaskStatus.Cancel)
private val HUMAN_CLOSED_STATUSES = setOf(TaskStatus.Done, TaskStatus.Cancel, TaskStatus.Missed)
private val HUMAN_DONE_STATUSES = setOf(TaskStatus.Done)

/** Um cartão de pessoa feito ou cancelado, ou um de agente em qualquer status final, já não lembra ninguém. */
fun endsReminders(
    actor: TaskActor,
    status: TaskStatus?,
): Boolean = status in (if (actor == TaskActor.Agent) FINAL_AGENT_STATUSES else HUMAN_SILENCING_STATUSES)

/** O executor terminou com a tarefa, bem ou mal: pessoa feita, cancelada ou perdida; agente em qualquer status final. */
fun isClosedStatus(
    actor: TaskActor,
    status: TaskStatus?,
): Boolean = status in (if (actor == TaskActor.Agent) FINAL_AGENT_STATUSES else HUMAN_CLOSED_STATUSES)

/** A subtarefa conta na fração "n de m feitas". */
fun countsAsDone(
    actor: TaskActor,
    status: TaskStatus?,
): Boolean = status in (if (actor == TaskActor.Agent) SUCCESS_AGENT_STATUSES else HUMAN_DONE_STATUSES)
