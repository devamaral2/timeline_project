package app.braid.mobile.domain.task

/** O que o formulário de tarefa grava e consulta: criar com chave de idempotência, editar com a revisão lida e as sugestões. */
interface TaskEditRepository {
    /**
     * Cria a tarefa e devolve o id (`POST /api/tasks`). [idempotencyKey] é a do rascunho: a mesma chave com o mesmo
     * corpo devolve a mesma tarefa, então um toque duplo não cria duas. A API recusar a entrada (400 e 422) sobe como
     * [InvalidInputException].
     */
    suspend fun create(
        task: CreateTask,
        idempotencyKey: String,
    ): String

    /**
     * Grava só o que mudou (`PATCH /api/tasks/{id}`) com a revisão lida. Revisão velha (409) sobe como
     * [StaleRevisionException]; entrada recusada (400 e 422), como [InvalidInputException].
     */
    suspend fun update(
        taskId: String,
        patch: TaskPatch,
    )

    /** Os nomes de tag do usuário que combinam com [query] (`GET /api/tags`), no máximo [limit]. */
    suspend fun tagSuggestions(
        query: String,
        limit: Int,
    ): List<String>

    /** Os rótulos de local que o serviço de mapas acha para [query] (`GET /api/places`), no máximo [limit]. */
    suspend fun placeSuggestions(
        query: String,
        limit: Int,
    ): List<String>
}

/** A API recusou alguma entrada do formulário (400 ou 422). */
class InvalidInputException(
    cause: Throwable? = null,
) : Exception("A API recusou alguma entrada.", cause)
