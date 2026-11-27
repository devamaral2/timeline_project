package app.braid.mobile.domain.execution

import app.braid.mobile.domain.task.IN_PROGRESS_AGENT_STATUSES
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.isInProgressAgentStatus
import kotlinx.coroutines.flow.Flow
import java.time.Instant

/*
 * O que a gaveta de execução lê da lista de tarefas acompanhadas: as execuções de agente em andamento, da mais
 * recente para a mais antiga, e quantas linhas cada altura da gaveta deixa à mostra. É a cópia, no app, de
 * `apps/web/src/lib/tasks/execution-runs.ts`; as fixtures geradas por ele conferem as duas.
 */

/** As alturas da gaveta: uma linha, três linhas (o padrão) ou todas. [code] é o que fica guardado no aparelho. */
enum class ExecutionDrawerMode(
    val code: String,
    /** Da menor para a maior: a gaveta cresce quando a nova altura tem posto maior. */
    private val rank: Int,
) {
    One("one", 1),
    Three("three", 2),
    All("all", 3),
    ;

    /** A gaveta cresce ao ir deste modo para [to]? Abrir é mais lento e as linhas que entram chegam uma depois da outra. */
    fun growsTo(to: ExecutionDrawerMode): Boolean = to.rank > rank

    companion object {
        val Default = Three

        /** O modo com este código; qualquer outro valor (inclusive `null`) vale o padrão. */
        fun fromCode(code: String?): ExecutionDrawerMode = entries.firstOrNull { it.code == code } ?: Default
    }
}

/** Quantas execuções a altura de três mostra. */
const val EXECUTION_PEEK = 3

/** Os status que a consulta pede: o grupo "em andamento", nunca uma lista solta. */
val EXECUTION_STATUS_FILTER = IN_PROGRESS_AGENT_STATUSES

/**
 * As execuções que a gaveta mostra: tarefa de agente em andamento que não é passo nem execução agendada, da que começou
 * há menos tempo para a que começou há mais. Sem início, vai para o fim; o desempate é o id, do maior para o menor.
 */
fun executionRunsOf(cards: List<TaskCard>): List<TaskCard> =
    cards
        .filter { it.actor == TaskActor.Agent && isInProgressAgentStatus(it.status) && it.kind != TaskKind.Step && it.kind != TaskKind.Cron }
        .sortedWith(
            compareByDescending<TaskCard> { it.startedAt ?: Instant.MIN }.thenByDescending { it.id },
        )

/** Quantas linhas a altura deixa à mostra. */
fun shownRowCount(
    mode: ExecutionDrawerMode,
    total: Int,
): Int =
    when (mode) {
        ExecutionDrawerMode.One -> minOf(total, 1)
        ExecutionDrawerMode.Three -> minOf(total, EXECUTION_PEEK)
        ExecutionDrawerMode.All -> total
    }

/** A altura que a pessoa escolheu para a gaveta, guardada no aparelho: vale nas três abas e sobrevive a fechar o app. */
interface ExecutionDrawerModeRepository {
    val mode: Flow<ExecutionDrawerMode>

    suspend fun select(mode: ExecutionDrawerMode)
}
