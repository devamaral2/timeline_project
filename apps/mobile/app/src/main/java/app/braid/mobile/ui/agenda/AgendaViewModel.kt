package app.braid.mobile.ui.agenda

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.domain.executor.ViewModeRepository
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.agendaTasksByDay
import app.braid.mobile.domain.task.hasOpenAgentTask
import app.braid.mobile.domain.task.matchingSearch
import app.braid.mobile.domain.task.statusPatch
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.weekOf
import app.braid.mobile.domain.timeline.zonedDayEnd
import app.braid.mobile.domain.timeline.zonedDayStart
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

/** Onde está a leitura da semana do dia escolhido. */
enum class AgendaLoad {
    /** A semana do dia escolhido ainda não chegou: os dias sem dados mostram o esqueleto. */
    Loading,
    Idle,

    /** A leitura falhou: os dias sem dados mostram o erro com "Tentar de novo". */
    Failed,
}

/**
 * [tasksByDay] tem uma chave para cada dia de toda semana já lida, vazia quando o
 * dia não tem tarefa: é a chave que diz que o dia chegou. Cada dia guarda os
 * cartões que a agenda mostra, na ordem do início.
 */
data class AgendaUiState(
    val todayKey: String,
    val selectedDay: String,
    val tasksByDay: Map<String, List<TaskCard>> = emptyMap(),
    val load: AgendaLoad = AgendaLoad.Loading,
    /** O instante da última leitura: os textos calculados da linha ("Hoje", "há 12 min") saem dele. */
    val now: Instant,
    /** A tarefa de referência cujo ponto foi tocado: a folha de status está aberta para ela. */
    val statusPicker: TaskCard? = null,
    /** O aviso da última troca de status que não gravou; some quando a próxima começa. */
    val notice: String? = null,
    /** De quem são as tarefas lidas: vem da escolha do menu, que vale para as três seções. */
    val viewMode: ViewMode = ViewMode.Default,
    /** O texto da busca do menu: filtra pelo nome as tarefas já lidas, sem nova leitura. */
    val search: String = "",
) {
    /** Há texto na busca: o tempo livre sai da agenda enquanto se busca. */
    val searching: Boolean get() = search.isNotBlank()

    /** As tarefas do dia que a busca deixa ver; `null` enquanto o dia não chegou. Um dia sem resultado fica visível, vazio. */
    fun shownOn(dayKey: String): List<TaskCard>? = tasksByDay[dayKey]?.matchingSearch(search)
}

/** De quanto em quanto tempo a agenda se relê enquanto há tarefa de agente em aberto. */
const val AGENT_POLL_MS = 3_000L

const val STALE_STATUS_NOTICE = "Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira e tente de novo."
const val FAILED_STATUS_NOTICE = "Não foi possível trocar o status. Tente novamente."

@HiltViewModel
class AgendaViewModel
    @Inject
    constructor(
        private val tasks: TaskRepository,
        private val modes: ViewModeRepository,
        private val clock: AppClock,
    ) : ViewModel() {
        private val mutableState =
            MutableStateFlow(clock.now().let { AgendaUiState(todayKey = dayKeyOf(it), selectedDay = dayKeyOf(it), now = it) })
        val state: StateFlow<AgendaUiState> = mutableState.asStateFlow()

        private var loadJob: Job? = null
        private var loadingWeek: String? = null
        private var generation = 0
        private var visible = false
        private var pollJob: Job? = null

        init {
            // A escolha guardada chega antes da primeira leitura; trocá-la depois relê a semana com o novo executor.
            viewModelScope.launch {
                var first = true
                modes.mode.collect { mode ->
                    if (first || mode != mutableState.value.viewMode) {
                        mutableState.update { it.copy(viewMode = mode, tasksByDay = if (first) it.tasksByDay else emptyMap()) }
                        load(mutableState.value.selectedDay, silent = false)
                    }
                    first = false
                }
            }
        }

        /** O texto da busca do menu. */
        fun search(text: String) = mutableState.update { it.copy(search = text) }

        /** Escolhe o dia (faixa da semana, mês, "Hoje" ou swipe); um dia de semana ainda não lida a lê. */
        fun selectDay(dayKey: String) {
            val current = mutableState.value
            if (dayKey == current.selectedDay) return
            mutableState.update { it.copy(selectedDay = dayKey) }
            if (dayKey !in current.tasksByDay && loadingWeek != weekOf(dayKey).first()) load(dayKey, silent = false)
            syncPolling()
        }

        /** Só a tarefa de referência (o ponto azul, sem status) abre a folha de status aqui; tarefa de pessoa com status e de agente não. */
        fun openStatusPicker(card: TaskCard) {
            if (card.actor != TaskActor.Human || card.status != null) return
            mutableState.update { it.copy(statusPicker = card) }
        }

        fun dismissStatusPicker() = mutableState.update { it.copy(statusPicker = null) }

        /**
         * Grava o status com a revisão lida. A folha fecha na hora; não há atualização otimista: a linha muda quando a
         * releitura volta. Revisão velha relê o dia e avisa; outra falha só avisa.
         */
        fun chooseStatus(status: TaskStatus) {
            val card = mutableState.value.statusPicker ?: return
            mutableState.update { it.copy(statusPicker = null, notice = null) }
            viewModelScope.launch {
                try {
                    tasks.changeStatus(card.id, statusPatch(card, status, clock.now()))
                    load(mutableState.value.selectedDay, silent = true)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (stale: StaleRevisionException) {
                    load(mutableState.value.selectedDay, silent = true)
                    mutableState.update { it.copy(notice = STALE_STATUS_NOTICE) }
                } catch (failure: Exception) {
                    mutableState.update { it.copy(notice = FAILED_STATUS_NOTICE) }
                }
            }
        }

        /** A tela está à vista (resumida) ou não: a releitura das tarefas de agente só anda com ela à vista. */
        fun setVisible(value: Boolean) {
            visible = value
            syncPolling()
        }

        private fun hasOpenAgentTaskInWeek(): Boolean {
            val current = mutableState.value
            return hasOpenAgentTask(weekOf(current.selectedDay).flatMap { current.tasksByDay[it].orEmpty() })
        }

        /**
         * Com tarefa de agente em aberto na semana à vista, relê a semana a cada [AGENT_POLL_MS], sem o esqueleto
         * e sem avisar de falha; para quando não sobra nenhuma ou a tela sai de vista. Uma leitura ainda em curso pula a batida.
         */
        private fun syncPolling() {
            if (!visible || !hasOpenAgentTaskInWeek()) {
                pollJob?.cancel()
                pollJob = null
                return
            }
            if (pollJob?.isActive == true) return
            pollJob =
                viewModelScope.launch {
                    while (visible && hasOpenAgentTaskInWeek()) {
                        delay(AGENT_POLL_MS)
                        if (loadJob?.isActive == true) continue
                        load(mutableState.value.selectedDay, silent = true)
                        loadJob?.join()
                    }
                }
        }

        fun retry() = load(mutableState.value.selectedDay, silent = false)

        /**
         * Ao voltar ao app o dia pode ter virado e as tarefas mudado (o agente, outro
         * aparelho): relê a semana sem trocar a tela pelo esqueleto.
         */
        fun onResume() {
            val now = clock.now()
            val today = dayKeyOf(now)
            mutableState.update {
                if (today == it.todayKey) {
                    it
                } else {
                    it.copy(todayKey = today, selectedDay = if (it.selectedDay == it.todayKey) today else it.selectedDay)
                }
            }
            load(mutableState.value.selectedDay, silent = true)
        }

        private fun load(
            dayKey: String,
            silent: Boolean,
        ) {
            val week = weekOf(dayKey)
            loadJob?.cancel()
            val ticket = ++generation
            loadingWeek = week.first()
            if (!silent) mutableState.update { it.copy(load = AgendaLoad.Loading) }
            loadJob =
                viewModelScope.launch {
                    try {
                        val cards = tasks.agenda(zonedDayStart(week.first()), zonedDayEnd(week.last()), mutableState.value.viewMode.actor)
                        val byDay = agendaTasksByDay(cards)
                        val readAt = clock.now()
                        mutableState.update {
                            it.copy(
                                tasksByDay = it.tasksByDay + week.associateWith { day -> byDay[day] ?: emptyList() },
                                load = AgendaLoad.Idle,
                                now = readAt,
                            )
                        }
                        syncPolling()
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (failure: Exception) {
                        // Uma releitura silenciosa que falha mantém a agenda que já está na tela.
                        mutableState.update {
                            if (!silent || it.load == AgendaLoad.Loading) it.copy(load = AgendaLoad.Failed) else it
                        }
                    } finally {
                        // Só a leitura mais recente solta a marca: uma cancelada termina depois que a nova começou.
                        if (generation == ticket) loadingWeek = null
                    }
                }
        }
    }
