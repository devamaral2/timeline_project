package app.braid.mobile.domain.task

import java.text.Collator
import java.util.Locale

/*
 * Port de `apps/web/src/lib/tasks/task-groups.ts` (grupos e uma linha por série) e de `task-filters.ts` (filtros da
 * lista): funções puras conferidas contra as fixtures geradas pelas funções TS (`TaskListRulesTest`). A hierarquia
 * (`nestSubtasks`) é da gaveta de subtarefas, ticket 08.
 */

enum class TaskGroupKey(
    val title: String,
    /** Feitas e Encerradas vêm recolhidos; abrem ao toque. */
    val collapsedByDefault: Boolean,
) {
    Doing("Em curso", false),
    Todo("A fazer", false),
    ToDefine("Sem data", false),
    Waiting("Em espera", false),
    Done("Feitas", true),
    Closed("Encerradas", true),
}

class TaskGroup(
    val key: TaskGroupKey,
    /** Os cartões do grupo, na ordem em que a API os devolveu. */
    val cards: List<TaskCard>,
) {
    val title: String get() = key.title
    val collapsedByDefault: Boolean get() = key.collapsedByDefault
}

/** Cada status, de pessoa ou de agente, cai em exatamente um grupo. */
private fun groupOf(status: TaskStatus): TaskGroupKey =
    when (status) {
        TaskStatus.Doing, TaskStatus.Running -> TaskGroupKey.Doing
        TaskStatus.Todo, TaskStatus.Queued -> TaskGroupKey.Todo
        TaskStatus.ToDefine -> TaskGroupKey.ToDefine
        TaskStatus.InHold, TaskStatus.Waiting -> TaskGroupKey.Waiting
        TaskStatus.Done -> TaskGroupKey.Done
        TaskStatus.Cancel, TaskStatus.Missed, TaskStatus.Failed -> TaskGroupKey.Closed
    }

/** Agrupa as linhas da lista; cartão sem status (de referência) fica de fora e grupo vazio não é devolvido. */
fun groupTrackedTasks(cards: List<TaskCard>): List<TaskGroup> =
    TaskGroupKey.entries
        .map { key -> TaskGroup(key, cards.filter { card -> card.status?.let(::groupOf) == key }) }
        .filter { it.cards.isNotEmpty() }

/** Status de pessoa em aberto: a série só mostra a ocorrência que ainda pede ação. */
private val OPEN_STATUSES = setOf(TaskStatus.Todo, TaskStatus.ToDefine, TaskStatus.Doing, TaskStatus.InHold)

/** A ocorrência que segue a série, isto é, que não foi editada. Só ela é contada e mostra a regra. */
private fun TaskCard.followsSeries(): Boolean = recurrence?.detached == false

/** Na linha, a regra da série sai no lugar do horário quando a ocorrência segue a série. */
fun showsSeriesRule(card: TaskCard): Boolean = card.followsSeries()

/**
 * Uma série aparece uma vez só: fica a ocorrência em aberto de menor `occurrenceOn`; sem nenhuma em aberto, a de
 * menor `occurrenceOn` de todas. A linha fica onde a escolhida estava na lista. Cartão sem série e ocorrência
 * destacada passam sem mudança.
 */
fun oneRowPerSeries(cards: List<TaskCard>): List<TaskCard> {
    val chosen = HashMap<String, TaskCard>()
    for (card in cards) {
        val seriesId = card.recurrence?.id?.takeIf { card.followsSeries() } ?: continue
        val current = chosen[seriesId]
        if (current == null || isPreferredOccurrence(card, current)) chosen[seriesId] = card
    }
    return cards.filter { card -> !card.followsSeries() || card.recurrence?.let { chosen[it.id] } === card }
}

private fun isPreferredOccurrence(
    candidate: TaskCard,
    current: TaskCard,
): Boolean {
    val candidateOpen = candidate.status in OPEN_STATUSES
    val currentOpen = current.status in OPEN_STATUSES
    if (candidateOpen != currentOpen) return candidateOpen
    return candidate.recurrence?.occurrenceOn.orEmpty() < current.recurrence?.occurrenceOn.orEmpty()
}

/** Os filtros da lista; a tela os manda como parâmetros da consulta, não filtra na mão. */
data class TaskFilters(
    /** Uma tag só, como a API aceita. */
    val tag: String? = null,
    /** Vários níveis ao mesmo tempo; vazio quer dizer todos. */
    val priorities: Set<TaskPriority> = emptySet(),
    /** Texto já aplicado, sem espaços nas pontas. */
    val query: String = "",
) {
    /** Quantos filtros estão ativos: o ponto da aba e o "Limpar filtros". */
    val count: Int get() = (if (tag != null) 1 else 0) + (if (priorities.isNotEmpty()) 1 else 0) + (if (query.isNotEmpty()) 1 else 0)
}

/** Os parâmetros de `GET /api/tasks/tracked`; lista e texto vazios não vão à rede. */
data class TrackedQuery(
    val tag: String?,
    /** Na ordem urgente, alta, média, baixa; vazio some da consulta. */
    val priorities: List<TaskPriority>,
    val query: String?,
)

fun trackedQuery(filters: TaskFilters): TrackedQuery =
    TrackedQuery(
        tag = filters.tag,
        priorities = TaskPriority.entries.filter { it in filters.priorities },
        query = filters.query.ifEmpty { null },
    )

/** As tags da lista sem filtro, da mais usada para a menos usada; no empate, pelo nome em português. */
fun tagsByUse(cards: List<TaskCard>): List<String> {
    val uses = LinkedHashMap<String, Int>()
    for (card in cards) for (tag in card.tags) uses[tag] = (uses[tag] ?: 0) + 1
    val collator = Collator.getInstance(Locale.forLanguageTag("pt-BR"))
    return uses.keys.sortedWith(compareByDescending<String> { uses.getValue(it) }.thenComparator { a, b -> collator.compare(a, b) })
}

/** Quantas tarefas usam cada tag, na lista sem filtro. */
fun tagCounts(cards: List<TaskCard>): Map<String, Int> {
    val counts = LinkedHashMap<String, Int>()
    for (card in cards) for (tag in card.tags) counts[tag] = (counts[tag] ?: 0) + 1
    return counts
}
