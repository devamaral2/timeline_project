package app.braid.mobile.domain.task

/** A fonte de tarefas do seletor de entidade: a lista de tarefas, de pessoa e de agente, filtrada pelo nome. */
interface TaskPickerRepository {
    /**
     * As tarefas acompanhadas (as que têm status) cujo nome combina com [query] (`GET /api/tasks/tracked?q=&limit=50`).
     * Vazia, devolve as primeiras da lista, para escolher sem digitar. [query] já vem sem espaços nas pontas.
     */
    suspend fun search(query: String): List<TaskCard>
}
