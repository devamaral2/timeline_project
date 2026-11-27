package app.braid.mobile.ui.shell

import app.braid.mobile.domain.execution.EXECUTION_PEEK
import app.braid.mobile.domain.execution.ExecutionDrawerMode
import app.braid.mobile.domain.execution.shownRowCount
import app.braid.mobile.domain.task.TaskCard

/** Em que grupo de entrada a linha está: a primeira fica sempre; a 2ª e a 3ª somem numa linha só; as demais só entram com tudo aberto. */
enum class RowTier { First, Peek, More }

class ExecutionRowModel(
    val card: TaskCard,
    val tier: RowTier,
    /** Em que ordem as linhas que entram chegam, uma depois da outra: 1, 2 e 3 (a primeira não entra). */
    val step: Int?,
    /** Escondida do leitor de tela e do toque: fora das linhas à mostra, ou, numa linha só, coberta pelo botão. */
    val hidden: Boolean,
    /** "+4": só a primeira linha leva, e é a contagem das outras. */
    val count: String?,
)

/** O que a gaveta desenha e o que ela diz ao leitor de tela, para as execuções e a altura de agora. */
class ExecutionDrawerModel(
    val mode: ExecutionDrawerMode,
    val total: Int,
    val shown: Int,
    val rows: List<ExecutionRowModel>,
) {
    /** "5 tarefas de agente em andamento". */
    val countLabel: String = "$total ${if (total == 1) "tarefa" else "tarefas"} de agente em andamento"

    /** Numa linha só o cabeçalho some, inclusive para o leitor de tela. */
    val headerHidden: Boolean get() = mode == ExecutionDrawerMode.One

    /** O cabeçalho informa o estado: todas à mostra ou só três. */
    val expanded: Boolean get() = mode == ExecutionDrawerMode.All

    val toggleTarget: ExecutionDrawerMode get() = if (expanded) ExecutionDrawerMode.Three else ExecutionDrawerMode.All

    val toggleLabel: String get() = "$countLabel. ${if (expanded) "Mostrar só três" else "Mostrar todas"}"

    /** O "+N" das escondidas, só na altura de três. */
    val rest: String get() = (total - EXECUTION_PEEK).let { if (mode == ExecutionDrawerMode.Three && it > 0) "+$it" else "" }

    val collapseLabel: String get() = "Mostrar só a tarefa mais recente"

    /** O botão que cobre a linha recolhida: volta a três. */
    val expandTarget: ExecutionDrawerMode get() = ExecutionDrawerMode.Three

    val expandLabel: String get() = "$countLabel, a mais recente é “${rows.first().card.name}”. Mostrar três"
}

/** `null` sem execução: a gaveta não existe. [runs] já vêm da mais recente para a mais antiga. */
fun executionDrawerModel(
    runs: List<TaskCard>,
    mode: ExecutionDrawerMode,
): ExecutionDrawerModel? {
    if (runs.isEmpty()) return null
    val total = runs.size
    val shown = shownRowCount(mode, total)
    val one = mode == ExecutionDrawerMode.One
    val rows =
        runs.mapIndexed { index, card ->
            ExecutionRowModel(
                card = card,
                tier = tierOf(index),
                step = if (index == 0) null else stepOf(index),
                hidden = index >= shown || (one && index == 0),
                count = if (index == 0 && total > 1) "+${total - 1}" else null,
            )
        }
    return ExecutionDrawerModel(mode, total, shown, rows)
}

private fun tierOf(index: Int): RowTier =
    when {
        index == 0 -> RowTier.First
        index < EXECUTION_PEEK -> RowTier.Peek
        else -> RowTier.More
    }

private fun stepOf(index: Int): Int = if (index < EXECUTION_PEEK) index else minOf(index - EXECUTION_PEEK + 1, 3)

/**
 * A gaveta aparece nas três abas, e só nelas: não no detalhe, na edição nem no login; não sem execução; não com o chat
 * aberto, que cobre a tela; e sai de vista com o menu da seção aberto, que sobe da barra por cima dela.
 */
fun executionDrawerShown(
    tab: MainTab?,
    hasRuns: Boolean,
    chatOpen: Boolean,
    menuOpen: Boolean,
): Boolean = tab != null && hasRuns && !chatOpen && !menuOpen
