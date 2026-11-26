package app.braid.mobile.domain.task

import java.time.Instant

/** O que o `PATCH` faz com `finishedAt`: não toca, grava a conclusão ou a apaga. */
sealed interface FinishedAtChange {
    data object Unchanged : FinishedAtChange

    data class Set(
        val at: Instant,
    ) : FinishedAtChange

    data object Cleared : FinishedAtChange
}

/** O `PATCH /api/tasks/{id}` que troca o status: a revisão lida, o novo status e o que acontece com a conclusão. */
data class StatusPatch(
    val expectedRevision: Int,
    val status: TaskStatus,
    val finishedAt: FinishedAtChange,
)

/** A ordem dos sete status de pessoa no seletor. */
private val HUMAN_STATUS_ORDER =
    listOf(
        TaskStatus.Todo,
        TaskStatus.ToDefine,
        TaskStatus.Doing,
        TaskStatus.InHold,
        TaskStatus.Done,
        TaskStatus.Cancel,
        TaskStatus.Missed,
    )

/** Os status que o seletor oferece: "Não realizado" é marca da tarefa comum, a tarefa longa nunca a recebe. */
fun humanStatusOptions(longRunning: Boolean): List<TaskStatus> = HUMAN_STATUS_ORDER.filterNot { longRunning && it == TaskStatus.Missed }

/**
 * Concluir envia `finishedAt` com o instante atual e sair de `done` o envia nulo: a API não grava a conclusão
 * sozinha. A revisão é a do cartão que a tela leu.
 */
fun statusPatch(
    card: TaskCard,
    status: TaskStatus,
    now: Instant,
): StatusPatch =
    StatusPatch(
        expectedRevision = card.revision,
        status = status,
        finishedAt =
            when {
                status == TaskStatus.Done -> FinishedAtChange.Set(now)
                card.status == TaskStatus.Done -> FinishedAtChange.Cleared
                else -> FinishedAtChange.Unchanged
            },
    )

private val OPEN_AGENT_STATUSES = setOf(TaskStatus.Queued, TaskStatus.Running, TaskStatus.Waiting, TaskStatus.AwaitingTranscription)

/** Há tarefa de agente na fila, executando ou aguardando você? Só ela faz a lista se reler sozinha; tarefa de pessoa nunca conta. */
fun hasOpenAgentTask(cards: List<TaskCard>): Boolean = cards.any { it.actor == TaskActor.Agent && it.status in OPEN_AGENT_STATUSES }
