package app.braid.mobile.ui.taskdetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.polling.PollingLoop
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentRequestRepository
import app.braid.mobile.domain.request.FOOD_CANCEL_TEXT
import app.braid.mobile.domain.request.FoodRequestCancelException
import app.braid.mobile.domain.request.PROMPT_MAX_LENGTH
import app.braid.mobile.domain.request.PreviousRequest
import app.braid.mobile.domain.request.RequestNotFoundException
import app.braid.mobile.domain.request.agentFailureText
import app.braid.mobile.domain.request.appendTranscript
import app.braid.mobile.domain.request.requestStatusLine
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.speech.MicrophonePermission
import app.braid.mobile.domain.speech.SpeechRecognizer
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskDetailRepository
import app.braid.mobile.domain.task.TaskNotFoundException
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.isOpenAgentStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.aiedit.DraftDictation
import app.braid.mobile.ui.chat.VoiceUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

const val REQUEST_NOT_FOUND_TEXT = "Pedido não encontrado."
const val REQUEST_LOAD_FAILED_TEXT = "Não foi possível carregar o pedido. Tente novamente."
const val AGENT_TASK_NOT_FOUND_TEXT = "Tarefa não encontrada."
const val AGENT_TASK_LOAD_FAILED_TEXT = "Não foi possível carregar a tarefa. Tente novamente."
const val SITUATION_FAILED_TEXT = "Não foi possível mudar a situação. Tente novamente."

/** O campo do rodapé: o texto, o envio e o cancelamento em voo e o pedido novo que a tela passou a acompanhar. */
data class Composer(
    val draft: String = "",
    val sending: Boolean = false,
    val cancelling: Boolean = false,
    /** O pedido que o campo abriu nesta tela; `followed` é `null` até a primeira leitura dele. */
    val followId: String? = null,
    val followed: AgentRequest? = null,
    val error: String? = null,
)

sealed interface AgentTaskUiState {
    data object Loading : AgentTaskUiState

    /** O pedido ou a tarefa não existe ou é de outro usuário (404 e 403). */
    data class Missing(
        val message: String,
    ) : AgentTaskUiState

    data class Failed(
        val message: String,
    ) : AgentTaskUiState

    data class Content(
        val task: TaskDetail,
        /** O pedido da tarefa (o mesmo id). Continuar não o troca: só o rodapé acompanha o pedido novo. */
        val request: AgentRequest,
        /** O instante da leitura: o "há 12 min" do início sai dele. */
        val now: Instant,
        val parent: LinkedTasks? = null,
        val subtasks: LinkedTasks? = null,
        val previous: PreviousRequest = PreviousRequest.None,
        val composer: Composer = Composer(),
        /** Quantas gravações de situação estão em curso: a mudança já está na tela e a API ainda não respondeu. */
        val situationSaves: Int = 0,
        /** A gravação da situação falhou e a tela voltou ao que era; some na próxima escolha. */
        val situationError: String? = null,
    ) : AgentTaskUiState {
        val savingSituation: Boolean get() = situationSaves > 0

        /** O pedido que o rodapé mostra e cancela: o que o campo abriu, ou o da tarefa enquanto nenhum foi aberto. */
        val tracked: AgentRequest? get() = if (composer.followId != null) composer.followed else request
        val statusLine: String get() = requestStatusLine(tracked)
        val canCancel: Boolean get() = tracked?.let { isOpenAgentStatus(it.status) } == true
        val canSend: Boolean get() = !composer.sending && !composer.cancelling && tracked != null

        /** O motivo da falha do pedido da tarefa, pelo mesmo texto que o chat mostra para o código do erro. */
        val requestFailure: String get() = agentFailureText(request.errorCode)

        /** O motivo da falha do pedido que o campo abriu; a falha do pedido da tarefa tem a própria seção. */
        val followFailure: String?
            get() = tracked?.takeIf { composer.followId != null && it.status == TaskStatus.Failed }?.let { agentFailureText(it.errorCode) }
    }
}

/**
 * O detalhe da tarefa de agente: lê a tarefa e o pedido com o mesmo id, a hierarquia e o pedido anterior da sessão;
 * continua a sessão com um pedido novo, cancela o pedido e se relê a cada [app.braid.mobile.domain.polling.AGENT_POLL_MS] enquanto ele está aberto.
 */
@HiltViewModel
class AgentTaskViewModel
    @Inject
    constructor(
        savedState: SavedStateHandle,
        private val tasks: TaskDetailRepository,
        private val taskList: TaskRepository,
        private val requests: AgentRequestRepository,
        private val session: SessionRepository,
        private val clock: AppClock,
        speech: SpeechRecognizer,
        microphone: MicrophonePermission,
    ) : ViewModel() {
        private val taskId: String = checkNotNull(savedState["taskId"]) { "O detalhe abre com o id da tarefa" }
        private val mutableState = MutableStateFlow<AgentTaskUiState>(AgentTaskUiState.Loading)
        val state: StateFlow<AgentTaskUiState> = mutableState.asStateFlow()
        private var visible = false
        private val polling = PollingLoop(viewModelScope)

        private val mutableVoice = MutableStateFlow(VoiceUiState())

        /** O microfone do campo do rodapé: só dita, nunca envia. */
        val voice: StateFlow<VoiceUiState> = mutableVoice.asStateFlow()

        private val dictation =
            DraftDictation(
                speech,
                microphone,
                viewModelScope,
                onVoice = { mutableVoice.value = it },
                onTranscript = { transcript -> updateComposer { it.copy(draft = appendTranscript(it.draft, transcript)) } },
            )

        init {
            load()
        }

        fun retry() = load()

        private fun load() {
            mutableState.value = AgentTaskUiState.Loading
            viewModelScope.launch {
                val (task, request) =
                    coroutineScope {
                        val readTask = async { attempt { tasks.task(taskId) } }
                        val readRequest = async { attempt { requests.request(taskId) } }
                        readTask.await() to readRequest.await()
                    }
                val failure = task.exceptionOrNull() ?: request.exceptionOrNull()
                if (failure != null) {
                    mutableState.value =
                        when (failure) {
                            is TaskNotFoundException -> AgentTaskUiState.Missing(AGENT_TASK_NOT_FOUND_TEXT)
                            is RequestNotFoundException -> AgentTaskUiState.Missing(REQUEST_NOT_FOUND_TEXT)
                            else -> AgentTaskUiState.Failed(if (task.isFailure) AGENT_TASK_LOAD_FAILED_TEXT else REQUEST_LOAD_FAILED_TEXT)
                        }
                    return@launch
                }
                val loaded = task.getOrThrow()
                val read = request.getOrThrow()
                val sessionId = read.sessionId
                mutableState.value =
                    AgentTaskUiState.Content(
                        task = loaded,
                        request = read,
                        now = clock.now(),
                        parent = if (loaded.parentTaskId != null) LinkedTasks() else null,
                        subtasks = if (loaded.subtaskIds.isNotEmpty()) LinkedTasks() else null,
                        previous = if (sessionId != null) PreviousRequest.Loading else PreviousRequest.None,
                    )
                syncPolling()
                launch { loadHierarchy(loaded) }
                if (sessionId != null) launch { loadPrevious(sessionId) }
            }
        }

        private suspend fun loadHierarchy(task: TaskDetail) {
            val parent = task.parentTaskId?.let { tasks.readLinked(listOf(it)) }
            val subtasks = if (task.subtaskIds.isNotEmpty()) tasks.readLinked(task.subtaskIds) else null
            updateContent { it.copy(parent = parent, subtasks = subtasks) }
        }

        private suspend fun loadPrevious(sessionId: String) {
            val previous =
                try {
                    val first = requests.request(sessionId)
                    PreviousRequest.Found(first.id, first.title, first.createdAt)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    PreviousRequest.NotFound
                }
            updateContent { it.copy(previous = previous) }
        }

        /** A tela está à vista (resumida) ou não: a releitura só anda com ela à vista. */
        fun setVisible(value: Boolean) {
            visible = value
            if (!value) dictation.cancel()
            syncPolling()
        }

        fun onDraftChange(text: String) = updateComposer { it.copy(draft = text.take(PROMPT_MAX_LENGTH)) }

        /** O botão do microfone: parado, liga; ouvindo, para e o que foi ouvido vai para o campo. */
        fun toggleVoice() = dictation.toggle(blocked = current()?.composer?.sending == true)

        /** A resposta do pedido de permissão do sistema: negada, diz por quê; concedida, liga a escuta. */
        fun microphoneResult(granted: Boolean) = dictation.permissionResult(granted)

        override fun onCleared() {
            dictation.cancel()
            super.onCleared()
        }

        /**
         * Muda a situação do pedido que terminou: aparece na hora e é gravada pelo `PUT`; se a gravação falha, volta ao que
         * era e a tela avisa. Pedido sem situação (aberto) ou a mesma situação não gravam nada.
         */
        fun chooseSituation(situation: TaskSituation) {
            val before = current()?.request?.situation ?: return
            if (situation == TaskSituation.Unknown || situation == before) return
            updateContent {
                it.copy(
                    request = it.request.copy(situation = situation),
                    situationSaves = it.situationSaves + 1,
                    situationError = null,
                )
            }
            viewModelScope.launch {
                try {
                    taskList.setSituation(taskId, situation)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    // Só desfaz se a tela ainda mostra a escolha que falhou: uma escolha mais nova não é apagada por esta.
                    updateContent {
                        it.copy(
                            request = if (it.request.situation == situation) it.request.copy(situation = before) else it.request,
                            situationError = SITUATION_FAILED_TEXT,
                        )
                    }
                } finally {
                    updateContent { it.copy(situationSaves = it.situationSaves - 1) }
                }
            }
        }

        /** Abre um pedido novo na mesma sessão e passa a acompanhá-lo. Falha mantém o texto e avisa. */
        fun send() {
            val content = current() ?: return
            val tracked = content.tracked
            val text = content.composer.draft.trim()
            if (tracked == null || !content.canSend || text.isEmpty()) return
            dictation.cancel()
            updateComposer { it.copy(sending = true, error = null) }
            viewModelScope.launch {
                try {
                    val userId = (session.state.value as? SessionState.SignedIn)?.user?.userId
                    val id = requests.start(checkNotNull(userId), text, tracked.sessionId ?: tracked.id, UUID.randomUUID().toString())
                    updateComposer { it.copy(sending = false, draft = "", followId = id, followed = null) }
                    readFollowed(id)
                    syncPolling()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    updateComposer { it.copy(sending = false, error = agentFailureText("connection_failed")) }
                }
            }
        }

        /** Cancela o pedido que o rodapé acompanha; o de alimento (409) pede para apagar o alimento. */
        fun cancel() {
            val content = current() ?: return
            val tracked = content.tracked ?: return
            if (!content.canCancel || content.composer.cancelling) return
            updateComposer { it.copy(cancelling = true, error = null) }
            viewModelScope.launch {
                try {
                    val view = requests.cancel(tracked.id)
                    updateContent { c ->
                        if (c.composer.followId != null) {
                            c.copy(composer = c.composer.copy(cancelling = false, followed = view))
                        } else {
                            c.copy(request = view, composer = c.composer.copy(cancelling = false))
                        }
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (food: FoodRequestCancelException) {
                    updateComposer { it.copy(cancelling = false, error = FOOD_CANCEL_TEXT) }
                } catch (failure: Exception) {
                    updateComposer { it.copy(cancelling = false, error = agentFailureText("connection_failed")) }
                }
            }
        }

        private suspend fun readFollowed(id: String) {
            val view = quietly { requests.request(id) } ?: return
            updateContent { if (it.composer.followId == id) it.copy(composer = it.composer.copy(followed = view)) else it }
        }

        /** O pedido da tarefa está aberto, ou o que o campo abriu ainda não terminou: a tela continua relendo. */
        private fun needsPolling(): Boolean {
            val content = current() ?: return false
            val following = content.composer.followId != null
            val followedOpen = following && content.composer.followed.let { it == null || isOpenAgentStatus(it.status) }
            return isOpenAgentStatus(content.request.status) || followedOpen
        }

        private fun syncPolling() {
            polling.sync(active = { visible && needsPolling() }) { tick() }
        }

        /**
         * Uma batida: relê o pedido da tarefa e, em seguida, a tarefa (a conclusão e a data vêm dela), e relê o pedido
         * que o campo abriu. Falha numa leitura mantém o que está na tela; a próxima batida tenta de novo.
         */
        private suspend fun tick() {
            val content = current() ?: return
            if (isOpenAgentStatus(content.request.status)) {
                quietly { requests.request(taskId) }?.let { view ->
                    updateContent { it.copy(request = view) }
                    quietly { tasks.task(taskId) }?.let { task -> updateContent { it.copy(task = task, now = clock.now()) } }
                }
            }
            val followId = content.composer.followId
            if (followId != null && content.composer.followed.let { it == null || isOpenAgentStatus(it.status) }) readFollowed(followId)
        }

        private fun current(): AgentTaskUiState.Content? = mutableState.value as? AgentTaskUiState.Content

        private fun updateContent(transform: (AgentTaskUiState.Content) -> AgentTaskUiState.Content) {
            mutableState.update { (it as? AgentTaskUiState.Content)?.let(transform) ?: it }
        }

        private fun updateComposer(transform: (Composer) -> Composer) = updateContent { it.copy(composer = transform(it.composer)) }

        private suspend fun <T> attempt(block: suspend () -> T): Result<T> =
            try {
                Result.success(block())
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Result.failure(failure)
            }

        private suspend fun <T> quietly(block: suspend () -> T): T? = attempt(block).getOrNull()
    }
