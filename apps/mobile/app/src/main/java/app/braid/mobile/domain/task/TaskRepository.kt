package app.braid.mobile.domain.task

import java.time.Instant

interface TaskRepository {
    /**
     * Os cartões de tarefa com início na janela [from, to]. [actor] pede só as tarefas da pessoa ou só as dos
     * agentes; `null` traz as duas.
     * Segue o cursor até a última página e descarta o cartão que uma página
     * repete (o usuário pode criar uma tarefa entre duas páginas). Falha de rede
     * ou de resposta sobe como exceção.
     */
    suspend fun agenda(
        from: Instant,
        to: Instant,
        actor: TaskActor? = null,
    ): List<TaskCard>

    /**
     * As tarefas acompanhadas, as que têm status, de pessoa e de agente (`GET /api/tasks/tracked`), na ordem do
     * servidor. [filters] vão como parâmetros da consulta e [actor] pede só um dos executores; `null` traz os dois.
     * A rota não pagina: o servidor devolve no máximo 100 cartões, como o web lê. [statuses] restringe a consulta a
     * esses status (a gaveta de execução pede os de agente em andamento); vazio traz todos.
     */
    suspend fun tracked(
        filters: TaskFilters,
        actor: TaskActor? = null,
        statuses: Set<TaskStatus> = emptySet(),
    ): List<TaskCard>

    /**
     * Grava a troca de status com a revisão que a tela leu. Uma revisão velha (409) sobe como
     * [StaleRevisionException]; qualquer outra falha sobe como exceção.
     */
    suspend fun changeStatus(
        taskId: String,
        patch: StatusPatch,
    )

    /**
     * Grava a situação do pedido de agente que terminou (`PUT /api/tasks/{id}/situation`). Vale a última gravação, sem
     * revisão; a tarefa que não aceita situação (409) e qualquer outra falha sobem como exceção.
     */
    suspend fun setSituation(
        taskId: String,
        situation: TaskSituation,
    )
}

/** Outra mudança chegou antes: a revisão que a tela leu já não é a da tarefa. */
class StaleRevisionException(
    cause: Throwable? = null,
) : Exception("A tarefa mudou em outro lugar.", cause)
