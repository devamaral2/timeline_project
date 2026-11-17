package app.braid.mobile.domain.task

import java.time.Instant

interface TaskRepository {
    /**
     * Os cartões de tarefa com início na janela [from, to], de pessoa e de agente.
     * Segue o cursor até a última página e descarta o cartão que uma página
     * repete (o usuário pode criar uma tarefa entre duas páginas). Falha de rede
     * ou de resposta sobe como exceção.
     */
    suspend fun agenda(
        from: Instant,
        to: Instant,
    ): List<TaskCard>

    /**
     * Grava a troca de status com a revisão que a tela leu. Uma revisão velha (409) sobe como
     * [StaleRevisionException]; qualquer outra falha sobe como exceção.
     */
    suspend fun changeStatus(
        taskId: String,
        patch: StatusPatch,
    )
}

/** Outra mudança chegou antes: a revisão que a tela leu já não é a da tarefa. */
class StaleRevisionException(
    cause: Throwable? = null,
) : Exception("A tarefa mudou em outro lugar.", cause)
