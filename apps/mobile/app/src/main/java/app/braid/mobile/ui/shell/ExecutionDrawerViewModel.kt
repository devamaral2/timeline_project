package app.braid.mobile.ui.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.execution.EXECUTION_STATUS_FILTER
import app.braid.mobile.domain.execution.ExecutionDrawerMode
import app.braid.mobile.domain.execution.ExecutionDrawerModeRepository
import app.braid.mobile.domain.execution.executionRunsOf
import app.braid.mobile.domain.polling.AGENT_POLL_MS
import app.braid.mobile.domain.polling.PollingLoop
import app.braid.mobile.domain.request.RequestStarted
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskFilters
import app.braid.mobile.domain.task.TaskRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** De quanto em quanto tempo a gaveta se relê quando não há execução em andamento. */
const val EXECUTION_IDLE_POLL_MS = 30_000L

/**
 * [runs] são as execuções de agente em andamento, da mais recente para a mais antiga; [mode] é a altura escolhida, que
 * vale nas três abas, e [grow] diz se a última troca fez a gaveta crescer (abrir é mais lento e as linhas entram uma
 * depois da outra). [ready] é falso até a altura guardada chegar do aparelho: sem ela a gaveta não anima de três para
 * a altura certa ao abrir o app.
 */
data class ExecutionDrawerUiState(
    val runs: List<TaskCard> = emptyList(),
    val mode: ExecutionDrawerMode = ExecutionDrawerMode.Default,
    val grow: Boolean = false,
    val ready: Boolean = false,
)

/**
 * O que a gaveta de execução mostra e quando relê. Um só para o app: a gaveta é a mesma nas três abas. Só lê com a gaveta
 * em cena ([setActive]: a tela atual tem a barra) e o app à vista ([setForeground]). Com execução relê a cada 3 s; parada,
 * ao voltar ao app, logo depois de o próprio app abrir um pedido e a cada 30 s. Falha de leitura mantém o que já está à mostra.
 */
@HiltViewModel
class ExecutionDrawerViewModel
    @Inject
    constructor(
        private val tasks: TaskRepository,
        private val modes: ExecutionDrawerModeRepository,
        requestStarted: RequestStarted,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(ExecutionDrawerUiState())
        val state: StateFlow<ExecutionDrawerUiState> = mutableState.asStateFlow()

        private val busyPolling = PollingLoop(viewModelScope, AGENT_POLL_MS)
        private val idlePolling = PollingLoop(viewModelScope, EXECUTION_IDLE_POLL_MS)
        private var active = false
        private var foreground = false

        /** Só a resposta da leitura mais recente entra na tela. */
        private var latestRequest = 0

        private val enabled: Boolean get() = active && foreground

        init {
            viewModelScope.launch {
                modes.mode.collect { mode -> mutableState.update { it.copy(mode = mode, ready = true) } }
            }
            viewModelScope.launch { requestStarted.signals.collect { if (enabled) refresh() } }
        }

        /** A tela atual tem a barra de navegação (as três abas), que é onde a gaveta existe. */
        fun setActive(value: Boolean) = changeEnabled { active = value }

        /** O app está à vista: ao voltar a ele, a gaveta relê na hora. */
        fun setForeground(value: Boolean) = changeEnabled { foreground = value }

        private fun changeEnabled(change: () -> Unit) {
            val before = enabled
            change()
            if (enabled && !before) viewModelScope.launch { refresh() }
            syncPolling()
        }

        /** Troca a altura: ela fica guardada no aparelho, e `grow` diz se a gaveta cresceu. */
        fun setMode(next: ExecutionDrawerMode) {
            mutableState.update { it.copy(mode = next, grow = it.mode.growsTo(next)) }
            viewModelScope.launch { modes.select(next) }
        }

        private fun syncPolling() {
            busyPolling.sync(active = { enabled && mutableState.value.runs.isNotEmpty() }) { refresh() }
            idlePolling.sync(active = { enabled && mutableState.value.runs.isEmpty() }) { refresh() }
        }

        private suspend fun refresh() {
            val request = ++latestRequest
            try {
                val cards = tasks.tracked(TaskFilters(), TaskActor.Agent, EXECUTION_STATUS_FILTER)
                if (request != latestRequest) return
                mutableState.update { it.copy(runs = executionRunsOf(cards)) }
                syncPolling()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                // A próxima batida tenta de novo; a gaveta segue com o que já mostra.
            }
        }
    }
