package app.braid.mobile.domain.task

/** A série de recorrência: ler, criar, trocar a regra e apagar. A tarefa de uma ocorrência aponta para ela. */
interface RecurrenceRepository {
    /** A série (`GET /api/recurrences/{id}`). Uma série que já não existe (404) sobe como [SeriesNotFoundException]. */
    suspend fun series(id: String): RecurrenceSeries

    /**
     * Cria a série e devolve o id (`POST /api/recurrences`). [idempotencyKey] é a do formulário: a mesma chave com o
     * mesmo corpo devolve a mesma série. A API recusar a regra (400 e 422) sobe como [InvalidInputException].
     */
    suspend fun create(
        series: NewSeries,
        idempotencyKey: String,
    ): String

    /**
     * Troca a regra (`PATCH /api/recurrences/{id}`) com a revisão lida. Revisão velha (409) sobe como
     * [StaleRevisionException]; regra recusada (400 e 422), como [InvalidInputException].
     */
    suspend fun update(
        id: String,
        patch: SeriesPatch,
    )

    /** Apaga a série inteira (`DELETE /api/recurrences/{id}`). */
    suspend fun delete(id: String)
}

/** A série já não existe (404): foi apagada em outro lugar. */
class SeriesNotFoundException(
    cause: Throwable? = null,
) : Exception("A série já não existe.", cause)
