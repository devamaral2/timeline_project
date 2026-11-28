package app.braid.mobile.domain.task

/**
 * A fonte de tarefas de pessoa para ligar a um artefato (`searchHumanTasks` do web): a lista de tarefas de pessoa pelo
 * nome e, depois dela, as tarefas de pessoa da agenda em volta de hoje (as sem status não estão na lista de tarefas). Se
 * a agenda falhar, a lista de tarefas ainda responde; se a lista falhar, a busca falha.
 */
interface HumanTaskSearch {
    /** [query] já vem sem espaços nas pontas; vazio, devolve as primeiras da lista e a agenda inteira em volta de hoje. */
    suspend fun search(query: String): List<TaskCard>
}

/**
 * Junta a lista de tarefas ([tracked]) e a agenda em volta de hoje ([nearby]) como o web: a lista primeiro, na ordem do
 * servidor; depois as da agenda que a lista não trouxe, sem repetir, e só as cujo nome contém [query] (sem maiúsculas
 * nem acentos).
 */
fun mergeHumanTaskChoices(
    query: String,
    tracked: List<TaskCard>,
    nearby: List<TaskCard>,
): List<TaskCard> {
    val text = plainText(query)
    val listed = tracked.mapTo(mutableSetOf()) { it.id }
    val fromAgenda =
        nearby.filter { card ->
            if (!listed.add(card.id)) return@filter false
            text.isEmpty() || plainText(card.name).contains(text)
        }
    return tracked + fromAgenda
}
