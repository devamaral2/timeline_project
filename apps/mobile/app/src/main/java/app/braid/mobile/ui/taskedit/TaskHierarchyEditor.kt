package app.braid.mobile.ui.taskedit

import app.braid.mobile.domain.polling.AGENT_POLL_MS
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentRequestRepository
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.RequestFollow
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.followRequest
import app.braid.mobile.domain.request.runningStepLabel
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.task.CreateTask
import app.braid.mobile.domain.task.HierarchySlot
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskDetailRepository
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.TaskEditRepository
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskPickerRepository
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.draftWithPicked
import app.braid.mobile.domain.task.draftWithoutParent
import app.braid.mobile.domain.task.draftWithoutSubtask
import app.braid.mobile.domain.task.isOpenAgentStatus
import app.braid.mobile.domain.task.isSuccessAgentStatus
import app.braid.mobile.domain.task.pickerExclusions
import app.braid.mobile.domain.task.topCreatedTasks
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.picker.EntityPickerController
import app.braid.mobile.ui.picker.EntityPickerState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID

const val TASK_SEARCH_FAILED = "Não foi possível buscar tarefas. Tente de novo."
const val TASK_CREATE_FAILED = "Não foi possível criar a tarefa. Tente de novo."
const val HERMES_ASK_FAILED = "O pedido ao Hermes falhou. Tente de novo."
const val HERMES_NOTHING_CREATED = "O Hermes não criou nenhuma tarefa com esse pedido."
const val HERMES_ASKING = "O Hermes está criando…"

/** O que o rodapé da folha está fazendo: criar só com o nome, pedir ao Hermes, ou a falha da última tentativa. */
sealed interface PickerFooter {
    data object Idle : PickerFooter

    data object Creating : PickerFooter

    /** [progress] é o que o pedido diz que faz agora; vazio, a folha escreve [HERMES_ASKING]. */
    data class Asking(
        val progress: String? = null,
    ) : PickerFooter

    data class Failed(
        val message: String,
    ) : PickerFooter

    val busy: Boolean get() = this is Creating || this is Asking
}

/** A folha aberta: de que lado da hierarquia é, a busca de tarefas e o rodapé que cria. */
data class TaskPicker(
    val slot: HierarchySlot,
    val search: EntityPickerState<TaskCard> = EntityPickerState(),
    val footer: PickerFooter = PickerFooter.Idle,
)

/**
 * O que a hierarquia mostra: os cartões das tarefas ligadas que já foram lidos (o rascunho guarda só os ids) e a folha.
 * [loadFailed] acende quando alguma leitura falhou: a linha sem cartão vira "Tarefa indisponível".
 */
data class HierarchyUiState(
    val cards: Map<String, TaskCard> = emptyMap(),
    val loadFailed: Boolean = false,
    val picker: TaskPicker? = null,
)

/**
 * A hierarquia do formulário de edição: lê o nome, o tipo e o quando de cada tarefa ligada, abre a folha de seleção de
 * tarefas (busca, "Criar" só com o nome e "Pedir ao Hermes") e entrega a escolha ao rascunho. Remover e escolher só
 * mexem no rascunho; a gravação fica para o Salvar do formulário. A tarefa criada, pela mão ou pelo Hermes, nasce na
 * hora e não some se o formulário for descartado: só a ligação espera o Salvar.
 */
class TaskHierarchyEditor(
    private val scope: CoroutineScope,
    private val taskId: String?,
    private val draft: () -> TaskDraft,
    private val updateDraft: ((TaskDraft) -> TaskDraft) -> Unit,
    private val details: TaskDetailRepository,
    private val edits: TaskEditRepository,
    private val picker: TaskPickerRepository,
    private val requests: AgentRequestRepository,
    private val session: SessionRepository,
    private val clock: AppClock,
    private val pollMillis: Long = AGENT_POLL_MS,
) {
    private val mutableState = MutableStateFlow(HierarchyUiState())
    val state: StateFlow<HierarchyUiState> = mutableState.asStateFlow()

    /** O instante das linhas ("Hoje, 09:00"): o relógio do app. */
    fun now(): Instant = clock.now()

    /** "Pedir ao Hermes" só aparece com a sessão aberta. */
    val canAskHermes: Boolean get() = userId() != null

    private fun userId(): String? = (session.state.value as? SessionState.SignedIn)?.user?.userId

    private val loading = mutableSetOf<String>()
    private var controller: EntityPickerController<TaskCard>? = null
    private var mirrorJob: Job? = null
    private var footerJob: Job? = null

    /** Um toque de novo no mesmo nome, depois de uma falha, reusa a chave: a API não cria a mesma tarefa duas vezes. */
    private var createKey: Pair<String, String>? = null

    /** Lê os cartões das tarefas [ids] que ainda não vieram; o nome, o tipo e o quando de cada linha saem deles. */
    fun sync(ids: List<String>) {
        val missing = ids.distinct().filter { it !in mutableState.value.cards && it !in loading }
        for (id in missing) {
            loading += id
            scope.launch {
                try {
                    val card = details.task(id).card
                    mutableState.update { it.copy(cards = it.cards + (id to card)) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    mutableState.update { it.copy(loadFailed = true) }
                } finally {
                    loading -= id
                }
            }
        }
    }

    fun open(slot: HierarchySlot) {
        close()
        val exclusions = pickerExclusions(slot, taskId.orEmpty(), draft())
        val next = EntityPickerController(scope, search = picker::search, keep = { it.id !in exclusions })
        controller = next
        mutableState.update { it.copy(picker = TaskPicker(slot)) }
        mirrorJob =
            scope.launch { next.state.collect { search -> mutableState.update { it.copy(picker = it.picker?.copy(search = search)) } } }
    }

    fun type(text: String) {
        controller?.type(text)
    }

    /** Fecha a folha sem escolher; o pedido ao Hermes que ainda corria não liga nada. */
    fun close() {
        controller?.close()
        mirrorJob?.cancel()
        footerJob?.cancel()
        controller = null
        mutableState.update { it.copy(picker = null) }
    }

    /** Escolher um resultado entrega a tarefa ao rascunho e fecha a folha. */
    fun pick(card: TaskCard) = deliver(listOf(card))

    fun removeParent() = updateDraft(::draftWithoutParent)

    fun removeSubtask(id: String) = updateDraft { draftWithoutSubtask(it, id) }

    /** "Criar “texto”": a tarefa nasce na hora, só com o nome e a fazer, e entra como uma escolha da busca. */
    fun create() {
        val text = typedText() ?: return
        if (footerBusy()) return
        val key = createKey?.takeIf { it.first == text }?.second ?: UUID.randomUUID().toString().also { createKey = text to it }
        setFooter(PickerFooter.Creating)
        footerJob =
            scope.launch {
                try {
                    val created = edits.create(CreateTask(TaskKind.Common, text, "", TaskPriority.Medium, status = TaskStatus.Todo), key)
                    deliver(listOf(details.task(created).card))
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    setFooter(PickerFooter.Failed(TASK_CREATE_FAILED))
                }
            }
    }

    /** "Pedir ao Hermes": manda o texto como pedido e acompanha até terminar; entram só as tarefas de cima. */
    fun askHermes() {
        val text = typedText() ?: return
        val userId = userId() ?: return
        if (footerBusy()) return
        setFooter(PickerFooter.Asking())
        footerJob =
            scope.launch {
                try {
                    val id = requests.start(userId, text, null, UUID.randomUUID().toString())
                    val outcome =
                        followRequest(
                            clock = clock,
                            read = { requests.request(id) },
                            onRead = { view ->
                                if (view.isOpen) setFooter(PickerFooter.Asking(view.progress ?: runningStepLabel(view.steps)))
                            },
                            intervalMs = pollMillis,
                            readFirst = true,
                        )
                    val request =
                        when (outcome) {
                            is RequestFollow.Closed -> outcome.request
                            RequestFollow.Lost, RequestFollow.TimedOut -> {
                                setFooter(PickerFooter.Failed(HERMES_ASK_FAILED))
                                return@launch
                            }
                        }
                    if (!isSuccessAgentStatus(request.status)) {
                        setFooter(PickerFooter.Failed(request.message ?: HERMES_ASK_FAILED))
                        return@launch
                    }
                    val top =
                        topCreatedTasks(
                            readCreated(
                                request.entities
                                    .filter {
                                        it.kind == EntityKind.Task &&
                                            it.operation == RequestOperation.Create
                                    }.map { it.id },
                            ),
                        )
                    if (top.isEmpty()) {
                        setFooter(PickerFooter.Failed(request.message ?: HERMES_NOTHING_CREATED))
                    } else {
                        deliver(top.map { it.card })
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    setFooter(PickerFooter.Failed(HERMES_ASK_FAILED))
                }
            }
    }

    private suspend fun readCreated(ids: List<String>): List<TaskDetail> =
        coroutineScope { ids.map { async { details.task(it) } }.awaitAll() }

    private fun deliver(cards: List<TaskCard>) {
        val slot = mutableState.value.picker?.slot ?: return
        mutableState.update { state -> state.copy(cards = state.cards + cards.associateBy { it.id }) }
        updateDraft { draftWithPicked(slot, it, cards) }
        close()
    }

    /**
     * O texto do campo vem da própria busca, não do espelho dela em [state]: o espelho é atualizado por quem coleta a
     * busca, que pode estar noutra thread terminando de gravar o resultado anterior. Lido do espelho, um toque em "Criar"
     * ou "Pedir ao Hermes" logo depois de digitar às vezes via o campo ainda vazio e não fazia nada.
     */
    private fun typedText(): String? =
        controller
            ?.state
            ?.value
            ?.typed
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

    private fun footerBusy(): Boolean =
        mutableState.value.picker
            ?.footer
            ?.busy == true

    private fun setFooter(footer: PickerFooter) = mutableState.update { it.copy(picker = it.picker?.copy(footer = footer)) }
}

private val AgentRequest.isOpen: Boolean get() = isOpenAgentStatus(status)
