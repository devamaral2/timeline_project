package app.braid.mobile.domain.task

interface TaskDetailRepository {
    /** A tarefa com tudo que o detalhe mostra. Não existe ou é de outro usuário (404 e 403) sobe como [TaskNotFoundException]. */
    suspend fun task(id: String): TaskDetail

    /** Grava a troca de status com a revisão que a tela leu; revisão velha (409) sobe como [StaleRevisionException]. */
    suspend fun changeStatus(
        taskId: String,
        patch: StatusPatch,
    )

    /** Grava a troca de prioridade com a revisão que a tela leu; revisão velha (409) sobe como [StaleRevisionException]. */
    suspend fun changePriority(
        taskId: String,
        expectedRevision: Int,
        priority: TaskPriority,
    )

    /**
     * Grava a lista inteira de artefatos da tarefa, na ordem dada, com a revisão que a tela leu (o "+" do detalhe grava
     * na hora). Revisão velha (409) sobe como [StaleRevisionException].
     */
    suspend fun changeArtifacts(
        taskId: String,
        expectedRevision: Int,
        links: List<ArtifactLink>,
    )

    /** Exclui a tarefa. Uma tarefa que já não existe (404) sobe como [TaskNotFoundException]. */
    suspend fun delete(taskId: String)
}

/** A tarefa não existe (404) ou é de outro usuário (403): para a tela dá no mesmo, "Tarefa não encontrada". */
class TaskNotFoundException(
    cause: Throwable? = null,
) : Exception("Tarefa não encontrada.", cause)
