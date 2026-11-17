package app.braid.mobile.ui.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.domain.executor.ViewModeRepository
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.SubtaskTree
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskFilters
import app.braid.mobile.domain.task.TaskGroup
import app.braid.mobile.domain.task.TaskGroupKey
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.groupTrackedTasks
import app.braid.mobile.domain.task.hasOpenAgentTask
import app.braid.mobile.domain.task.nestSubtasks
import app.braid.mobile.domain.task.oneRowPerSeries
import app.braid.mobile.domain.task.statusPatch
import app.braid.mobile.domain.task.tagCounts
import app.braid.mobile.domain.task.tagsByUse
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.agenda.AGENT_POLL_MS
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

/** Espera depois da última tecla antes de consultar a API pelo texto, como a aba de documentos do web. */
const val TASK_SEARCH_DEBOUNCE_MS = 250L

const val STALE_TASK_LIST_NOTICE = "Esta tarefa mudou em outro lugar. Carregamos a lista atual; confira e tente de novo."
const val FAILED_TASK_LIST_NOTICE = "Não foi possível trocar o status. Tente novamente."

/**
 * [cards] é a última lista lida com os filtros de agora, e `null` até a primeira chegar. [facets] é a última lista lida
 * sem filtro nenhum: dela saem as tags do menu, que sobrevivem ao filtro.
 */
data class TasksUiState(
    val cards: List<TaskCard>? = null,
    val facets: List<TaskCard>? = null,
    /** A leitura falhou: a tela mostra o erro com "Tentar de novo". */
    val failed: Boolean = false,
    val tag: String? = null,
    val priorities: Set<TaskPriority> = emptySet(),
    /** O que está escrito na busca; [query] é o texto já aplicado, depois da espera. */
    val typed: String = "",
    val query: String = "",
    /** Os grupos recolhidos que o usuário abriu; só vale para Feitas e Encerradas. */
    val expanded: Set<TaskGroupKey> = emptySet(),
    /** As tarefas com a gaveta de subtarefas fechada; as gavetas começam abertas, as aninhadas também. */
    val closedSubtasks: Set<String> = emptySet(),
    /** A tarefa de pessoa cujo glifo foi tocado: a folha de status está aberta para ela. */
    val statusPicker: TaskCard? = null,
    val notice: String? = null,
    val saving: Boolean = false,
    /** O instante da última leitura: os textos calculados da linha ("Hoje", "há 12 min") saem dele. */
    val now: Instant,
    /** De quem são as tarefas lidas: vem da escolha do menu, que vale para as três seções. */
    val viewMode: ViewMode = ViewMode.Default,
) {
    val filters: TaskFilters get() = TaskFilters(tag, priorities, query)

    /** Uma série vale uma linha só; a subtarefa cuja principal está na lista vai para a gaveta dela. */
    val tree: SubtaskTree by lazy(LazyThreadSafetyMode.NONE) { nestSubtasks(oneRowPerSeries(cards.orEmpty())) }

    /** Os grupos são feitos das linhas: a subtarefa na gaveta não entra neles nem na contagem. */
    val groups: List<TaskGroup> by lazy(LazyThreadSafetyMode.NONE) { groupTrackedTasks(tree.roots) }

    /** As linhas dos grupos que não vêm recolhidos: o número do topo e o do menu. */
    val openCount: Int get() = groups.filterNot { it.collapsedByDefault }.sumOf { it.cards.size }

    val tags: List<String> get() = tagsByUse(facets.orEmpty())

    val tagCounts: Map<String, Int> get() = tagCounts(facets.orEmpty())

    /** A lista sem filtro ainda não tem tarefa nenhuma: o estado vazio de quem não criou a primeira. */
    val hasTasks: Boolean get() = !facets.isNullOrEmpty()

    fun isExpanded(group: TaskGroup): Boolean = !group.collapsedByDefault || group.key in expanded

    fun isDrawerOpen(taskId: String): Boolean = taskId !in closedSubtasks
}

@HiltViewModel
class TasksViewModel
    @Inject
    constructor(
        private val tasks: TaskRepository,
        private val modes: ViewModeRepository,
        private val clock: AppClock,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(TasksUiState(now = clock.now()))
        val state: StateFlow<TasksUiState> = mutableState.asStateFlow()

        /** Só a resposta da leitura mais recente entra na tela: um filtro trocado no meio não deixa lista velha. */
        private var latestRequest = 0
        private var searchJob: Job? = null
        private var pollJob: Job? = null
        private var visible = false

        init {
            // A escolha guardada chega antes da primeira leitura; trocá-la depois relê a lista com o novo executor.
            viewModelScope.launch {
                var first = true
                modes.mode.collect { mode ->
                    if (first || mode != mutableState.value.viewMode) {
                        mutableState.update { it.copy(viewMode = mode) }
                        launch { refresh(quiet = false) }
                    }
                    first = false
                }
            }
        }

        /** O texto da busca do menu: a consulta só sai 250 ms depois da última tecla. */
        fun search(text: String) {
            mutableState.update { it.copy(typed = text) }
            searchJob?.cancel()
            searchJob =
                viewModelScope.launch {
                    delay(TASK_SEARCH_DEBOUNCE_MS)
                    changeFilters { it.copy(query = text.trim()) }
                }
        }

        /** Escolher a tag que já está escolhida a desmarca. */
        fun toggleTag(name: String) = changeFilters { it.copy(tag = if (it.tag == name) null else name) }

        fun togglePriority(level: TaskPriority) =
            changeFilters { it.copy(priorities = if (level in it.priorities) it.priorities - level else it.priorities + level) }

        /** Limpa tag, prioridade e busca; o executor não volta ao padrão. */
        fun clearFilters() {
            searchJob?.cancel()
            mutableState.update { it.copy(typed = "") }
            changeFilters { it.copy(tag = null, priorities = emptySet(), query = "") }
        }

        private fun changeFilters(transform: (TasksUiState) -> TasksUiState) {
            val before = mutableState.value.filters
            mutableState.update(transform)
            if (mutableState.value.filters != before) viewModelScope.launch { refresh(quiet = false) }
        }

        fun toggleGroup(key: TaskGroupKey) =
            mutableState.update {
                it.copy(
                    expanded =
                        if (key in
                            it.expanded
                        ) {
                            it.expanded - key
                        } else {
                            it.expanded + key
                        },
                )
            }

        /** Abre ou fecha a gaveta de uma tarefa; fechar a principal guarda o que as filhas tinham escolhido. */
        fun toggleSubtasks(taskId: String) =
            mutableState.update {
                it.copy(closedSubtasks = if (taskId in it.closedSubtasks) it.closedSubtasks - taskId else it.closedSubtasks + taskId)
            }

        fun retry() {
            mutableState.update { it.copy(failed = false, cards = null) }
            viewModelScope.launch { refresh(quiet = false) }
        }

        /** O glifo de uma tarefa de pessoa, com qualquer status, abre a folha; o de agente não muda status. */
        fun openStatusPicker(card: TaskCard) {
            if (mutableState.value.saving || card.actor != TaskActor.Human) return
            mutableState.update { it.copy(statusPicker = card) }
        }

        fun dismissStatusPicker() = mutableState.update { it.copy(statusPicker = null) }

        /**
         * Grava o status com a revisão lida; a lista muda quando a releitura volta, sem atualização otimista. Revisão
         * velha relê a lista e avisa. Escolher o status que a tarefa já tem só fecha a folha.
         */
        fun chooseStatus(status: TaskStatus) {
            val card = mutableState.value.statusPicker ?: return
            mutableState.update { it.copy(statusPicker = null) }
            if (mutableState.value.saving || status == card.status) return
            mutableState.update { it.copy(saving = true, notice = null) }
            viewModelScope.launch {
                try {
                    tasks.changeStatus(card.id, statusPatch(card, status, clock.now()))
                    refresh(quiet = false)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (stale: StaleRevisionException) {
                    refresh(quiet = false)
                    mutableState.update { it.copy(notice = STALE_TASK_LIST_NOTICE) }
                } catch (failure: Exception) {
                    mutableState.update { it.copy(notice = FAILED_TASK_LIST_NOTICE) }
                } finally {
                    mutableState.update { it.copy(saving = false) }
                }
            }
        }

        /** A tela está à vista (resumida) ou não: a releitura das tarefas de agente só anda com ela à vista. */
        fun setVisible(value: Boolean) {
            visible = value
            syncPolling()
        }

        /** Ao voltar à lista ela pode ter mudado (o agente, outro aparelho, a Agenda): relê sem trocar a tela pelo esqueleto. */
        fun onResume() {
            if (mutableState.value.cards != null) viewModelScope.launch { refresh(quiet = true) }
        }

        /**
         * Com tarefa de agente em aberto na lista, relê a cada [AGENT_POLL_MS], sem o esqueleto e sem avisar de falha;
         * para quando não sobra nenhuma ou a tela sai de vista.
         */
        private fun syncPolling() {
            if (!visible || !hasOpenAgentTask(mutableState.value.cards.orEmpty())) {
                pollJob?.cancel()
                pollJob = null
                return
            }
            if (pollJob?.isActive == true) return
            pollJob =
                viewModelScope.launch {
                    while (visible && hasOpenAgentTask(mutableState.value.cards.orEmpty())) {
                        delay(AGENT_POLL_MS)
                        refresh(quiet = true)
                    }
                }
        }

        /**
         * Relê a lista com os filtros e o executor de agora. Falha vira o erro com "Tentar de novo"; uma releitura
         * silenciosa que falha mantém a lista que já está na tela.
         */
        private suspend fun refresh(quiet: Boolean) {
            val request = ++latestRequest
            val current = mutableState.value
            try {
                val list = tasks.tracked(current.filters, current.viewMode.actor)
                if (request != latestRequest) return
                mutableState.update {
                    it.copy(
                        cards = list,
                        failed = false,
                        now = clock.now(),
                        // Sem filtro, a lista inteira é também a fonte das opções de tag.
                        facets = if (current.filters.count == 0) list else it.facets,
                    )
                }
                syncPolling()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                if (request == latestRequest && !quiet) mutableState.update { it.copy(failed = true) }
            }
        }
    }
