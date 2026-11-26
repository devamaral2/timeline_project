package app.braid.mobile.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.chat.CHAT_LEAVE_TEXT
import app.braid.mobile.domain.chat.ChatAgent
import app.braid.mobile.domain.chat.ChatFailureCode
import app.braid.mobile.domain.chat.ChatModeCommand
import app.braid.mobile.domain.chat.ChatPolling
import app.braid.mobile.domain.chat.ChatRepository
import app.braid.mobile.domain.chat.ChatRequestException
import app.braid.mobile.domain.chat.HERMES_ENTER_TEXT
import app.braid.mobile.domain.chat.HERMES_OFF_TEXT
import app.braid.mobile.domain.chat.MODEL_OFF_TEXT
import app.braid.mobile.domain.chat.ModelSelector
import app.braid.mobile.domain.chat.STEPS_PENDING_LABEL
import app.braid.mobile.domain.chat.chatFailureText
import app.braid.mobile.domain.chat.hermesStepsOf
import app.braid.mobile.domain.chat.modelEnterText
import app.braid.mobile.domain.chat.parseChatCommand
import app.braid.mobile.domain.chat.parseCommand
import app.braid.mobile.domain.chat.pendingLabelOf
import app.braid.mobile.domain.chat.providerOf
import app.braid.mobile.domain.chat.providerOffText
import app.braid.mobile.domain.chat.requestWithWindow
import app.braid.mobile.domain.markdown.soleYouTubeVideoLink
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.HermesOffException
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOffException
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.RequestRoute
import app.braid.mobile.domain.request.appendTranscript
import app.braid.mobile.domain.request.isOpenRequest
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.speech.GrantedMicrophone
import app.braid.mobile.domain.speech.MicrophonePermission
import app.braid.mobile.domain.speech.NoSpeechRecognizer
import app.braid.mobile.domain.speech.SpeechDictation
import app.braid.mobile.domain.speech.SpeechError
import app.braid.mobile.domain.speech.SpeechRecognizer
import app.braid.mobile.domain.speech.isStopSpeech
import app.braid.mobile.domain.speech.speechErrorMessage
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.transcription.TranscriptionRepository
import app.braid.mobile.domain.transcription.TranscriptionText
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

private const val BOT_DONE_MS = 2_400L
private const val BOT_ERROR_MS = 2_600L

/** Quanto silêncio, depois de a pessoa falar, envia o que ela disse. */
private const val SILENCE_SEND_MS = 1_800L

/**
 * A conversa com o agente. Vive acima da folha (o `ViewModel` é da atividade): fechar o chat ou trocar de tela não apaga a
 * conversa nem derruba a resposta em andamento; só "Nova conversa" a zera. Cada mensagem vira um pedido na API (rota por
 * passos) ou, depois de `/hermes` ou de um comando de modelo (`/modelo`, `/claude`, `/openai`, `/openrouter`), vai ao Hermes ou
 * ao modelo escolhido (ADR 0019); o pedido é acompanhado até o fim e a caixa de processo mostra cada passo. A escolha de
 * provedor, modelo e esforço ([ModelSelector]) aparece no campo desde que o chat abre e vai também nos pedidos por passos.
 */
@HiltViewModel
class ChatViewModel
    @Inject
    constructor(
        private val repository: ChatRepository,
        private val session: SessionRepository,
        private val clock: AppClock,
        private val polling: ChatPolling,
        private val models: ModelSelector,
        private val transcription: TranscriptionRepository,
        private val speech: SpeechRecognizer = NoSpeechRecognizer,
        private val microphone: MicrophonePermission = GrantedMicrophone,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(ChatUiState(todayKey = dayKeyOf(clock.now()), model = models.state.value))
        val state: StateFlow<ChatUiState> = mutableState.asStateFlow()

        private val mutableEntitiesChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

        /** Um pedido mexeu em registros (ou pode ter mexido): as telas que mostram tarefas se releem. */
        val entitiesChanged: SharedFlow<Unit> = mutableEntitiesChanged.asSharedFlow()

        private var userId: String? = null

        /** O app está à vista: em segundo plano o acompanhamento do pedido espera, como o das outras telas. */
        private val visible = MutableStateFlow(true)

        /** O primeiro pedido da conversa: toda mensagem seguinte o manda como `sessionId`. */
        private var sessionId: String? = null

        /** As mensagens (ids) cujo pedido o chat está acompanhando agora: a enviada e as recuperadas ao abrir. */
        private val following = mutableSetOf<String>()

        /** Os pedidos (ids da API) que a conversa já mostra ou enviou: a lista ao abrir não os repete. */
        private val knownRequests = mutableSetOf<String>()
        private var recovering = false
        private val deferred = mutableListOf<() -> Unit>()

        private var botThinking = false
        private var botTimer: Job? = null

        /** O robô sem a voz: [ChatUiState.bot] é este, ou "ouvindo" enquanto o microfone está aberto. */
        private var baseBot = BotState.Idle

        // region Estado da voz

        private val mutablePromptEdits = MutableSharedFlow<String>(extraBufferCapacity = 8)

        /** O texto novo do campo quando a voz o muda (a transcrição, ou o campo limpo ao enviar o que foi dito). */
        val promptEdits: SharedFlow<String> = mutablePromptEdits.asSharedFlow()

        /** O que está escrito no campo (sem o que o microfone ainda ouve): a tela o informa a cada mudança. */
        private var draft = ""

        /** O microfone que abriu sozinho não reclama: só o erro de quando a pessoa tocou no botão aparece. */
        private var quietVoice = true

        /** Abrir o chat arma uma escuta; ela liga assim que dá (a sessão pode chegar depois) e só uma vez por abertura. */
        private var autoListen = false
        private var userTyped = false
        private var askingPermission = false
        private var permissionDenied = false
        private var askedByAuto = false
        private var permissionNotice: String? = null

        private val dictation =
            SpeechDictation(
                recognizer = speech,
                scope = viewModelScope,
                silenceMs = SILENCE_SEND_MS,
                onFinalTranscript = { transcript -> fillPrompt(appendTranscript(draft, transcript)) },
                onSilenceTranscript = ::sendSpoken,
            )

        // endregion

        init {
            viewModelScope.launch {
                dictation.state.collect {
                    refreshVoice()
                }
            }
            // A escolha de modelo é do app inteiro: a troca feita na barra de um detalhe aparece aqui também.
            viewModelScope.launch { models.state.collect { model -> mutableState.update { it.copy(model = model) } } }
            viewModelScope.launch {
                session.state.collect { current ->
                    val id = (current as? SessionState.SignedIn)?.user?.userId
                    if (id != userId) {
                        // Outra conta (ou nenhuma) não herda a conversa da anterior.
                        if (userId != null) reset()
                        userId = id
                        // A sessão que chega com o chat já aberto lê as opções que a abertura não pôde ler.
                        if (mutableState.value.open) loadModels()
                    }
                    mutableState.value = mutableState.value.copy(ready = id != null, signedOut = current is SessionState.SignedOut)
                    tryAutoListen()
                }
            }
        }

        // region Abrir e fechar

        /** Abre o chat e volta a acompanhar os pedidos que ainda rodam. */
        fun open() {
            mutableState.value = mutableState.value.copy(open = true, todayKey = dayKeyOf(clock.now()))
            // Aberto pela pessoa, o chat já começa ouvindo (se dá para falar com a IA agora).
            userTyped = false
            autoListen = true
            tryAutoListen()
            recover()
            loadModels()
        }

        /**
         * Abrir o chat (e começar uma conversa nova) lê o que o servidor oferece: com as opções, o campo mostra o seletor e
         * cada pedido leva a escolha. Sem elas (modo modelo desligado, rede) o campo fica simples, e a próxima abertura tenta
         * de novo.
         */
        private fun loadModels() {
            if (userId == null) return
            viewModelScope.launch { models.load() }
        }

        fun close() {
            pauseVoice()
            mutableState.value = mutableState.value.copy(open = false, freeWindow = null)
        }

        /** Tocar numa janela livre da Agenda: sempre uma conversa nova, com a janela anexada. */
        fun openWithFreeWindow(window: FreeWindow) {
            startNewConversation()
            mutableState.value = mutableState.value.copy(freeWindow = window)
            open()
        }

        fun clearFreeWindow() {
            mutableState.value = mutableState.value.copy(freeWindow = null)
        }

        fun setPane(pane: ChatPane) {
            mutableState.value = mutableState.value.copy(pane = pane)
        }

        // endregion

        // region Enviar

        /** Envia o que a pessoa escreveu no campo: com a janela livre anexada, ela vai escrita na frente. */
        fun submit(draft: String): Boolean {
            val sent = sendWithWindow(draft)
            if (sent) {
                // Enviar pelo teclado ou pelo botão é pedido de texto: fecha o microfone.
                dictation.cancel()
                refreshVoice()
            }
            return sent
        }

        private fun sendWithWindow(text: String): Boolean {
            val window = mutableState.value.freeWindow
            val sent = send(if (window != null) requestWithWindow(window, text) else text)
            if (sent) clearFreeWindow()
            return sent
        }

        /** Envia uma mensagem; `false` quando está vazia, sem usuário ou com um pedido em andamento. */
        fun send(text: String): Boolean = dispatch(text, newId())

        private fun newId(): String = UUID.randomUUID().toString()

        private fun dispatch(
            text: String,
            id: String,
        ): Boolean {
            val trimmed = text.trim()
            if (trimmed.isEmpty() || userId == null || mutableState.value.pending != null) return false
            val command = parseChatCommand(trimmed)
            val notice = { text: String -> ChatMessage.Assistant("$id-notice", text) }

            // `/hermes` sozinho só liga o modo; `/app` o desliga. Nenhum dos dois vai ao servidor.
            if (command is ChatModeCommand.Leave && mutableState.value.agentMode != null) {
                commit { it.copy(agentMode = null, messages = it.messages + ChatMessage.User(id, trimmed) + notice(CHAT_LEAVE_TEXT)) }
                return true
            }
            if (command is ChatModeCommand.Hermes && command.text == null) {
                commit {
                    it.copy(
                        agentMode = ChatAgent.Hermes,
                        messages =
                            it.messages + ChatMessage.User(id, trimmed) + notice(HERMES_ENTER_TEXT),
                    )
                }
                return true
            }
            if (command is ChatModeCommand.Hermes) commit { it.copy(agentMode = ChatAgent.Hermes) }

            val agent = mutableState.value.agentMode
            following += id
            commit { it.copy(messages = it.messages + ChatMessage.User(id, trimmed), pending = ChatPending(id, null)) }
            // Só o link de um vídeo do YouTube, no assistente da agenda, vai direto ao pedido de transcrição (spec #39).
            val videoLink = if (command == null && agent == null) soleYouTubeVideoLink(trimmed) else null
            val run = {
                when {
                    videoLink != null -> runTranscription(id, videoLink)
                    command is ChatModeCommand.Model -> enterModelMode(id, command.provider, command.text)
                    command is ChatModeCommand.Hermes -> runAgent(ChatAgent.Hermes, id, command.text ?: trimmed)
                    agent != null -> runAgent(agent, id, trimmed)
                    else -> runRequest(id, trimmed)
                }
            }
            if (recovering) deferred += run else run()
            return true
        }

        /**
         * Abre o pedido na API (o id da mensagem é o `clientMessageId`), com a escolha de modelo que o campo mostra, e o
         * acompanha até o fim. Um envio antes de as opções chegarem espera por elas; sem o modo modelo neste ambiente (ou sem
         * rede) o pedido vai sem escolha.
         */
        private fun runRequest(
            id: String,
            text: String,
        ) {
            val user = userId ?: return
            viewModelScope.launch {
                val requestId =
                    try {
                        repository.start(user, text, sessionId, id, models.selectionForRequest())
                    } catch (failure: ChatRequestException) {
                        fail(id, failure.failure)
                        return@launch
                    }
                sessionId = sessionId ?: requestId
                knownRequests += requestId
                val processId = "$id-process"
                commit {
                    it.copy(
                        messages = it.messages.filter { message -> message.id != processId } + ChatMessage.Process(processId, null),
                        turns = upsertTurn(it.turns, ChatTurn(id, text, RequestRoute.Steps, running = true, trace = null)),
                        pending = ChatPending(id, STEPS_PENDING_LABEL, requestId),
                    )
                }
                followRequest(id, requestId)
            }
        }

        /**
         * A mensagem que é só um link de vídeo do YouTube: vai direto ao pedido de transcrição, antes do agente de roteamento,
         * sem gastar modelo para classificá-la. A resposta diz que o vídeo entrou na fila e leva à Leitura diária. Não abre
         * pedido de chat: não há rastro nem caixa de processo.
         */
        private fun runTranscription(
            id: String,
            url: String,
        ) {
            if (userId == null) return
            commit { it.copy(pending = ChatPending(id, TranscriptionText.CHAT_PENDING)) }
            viewModelScope.launch {
                val result =
                    try {
                        transcription.request(url)
                    } catch (failure: ChatRequestException) {
                        val refused = failure.failure == ChatFailureCode.InvalidInput
                        fail(id, failure.failure, if (refused) TranscriptionText.INVALID_LINK else null)
                        return@launch
                    }
                if (id !in following) return@launch
                following -= id
                val reading = RequestEntity(EntityKind.Task, result.taskId, TranscriptionText.DAILY_READING, null, RequestOperation.Update)
                val text = if (result.created) TranscriptionText.CHAT_QUEUED else TranscriptionText.CHAT_AGAIN
                commit {
                    it.copy(
                        pending = if (it.pending?.id == id) null else it.pending,
                        messages = it.messages + ChatMessage.Assistant("$id-transcription", text, listOf(reading)),
                    )
                }
                mutableEntitiesChanged.tryEmit(Unit)
            }
        }

        /**
         * A mensagem a um agente de modo: vira um pedido na rota dele, com o id da mensagem (reenviar não abre outro) e a
         * sessão; no modo modelo, com a escolha atual de provedor, modelo e esforço. Com o agente desligado a API responde
         * 404: o chat avisa e sai do modo.
         */
        private fun runAgent(
            agent: ChatAgent,
            id: String,
            text: String,
        ) {
            val user = userId ?: return
            viewModelScope.launch {
                val request =
                    try {
                        when (agent) {
                            ChatAgent.Hermes -> repository.sendHermes(user, text, sessionId, id)
                            ChatAgent.Model -> repository.sendModel(user, text, sessionId, id, models.picker().selection)
                        }
                    } catch (failure: Exception) {
                        if (failure is HermesOffException || failure is ModelOffException) {
                            following -= id
                            commit {
                                it.copy(
                                    agentMode = null,
                                    pending = null,
                                    messages =
                                        it.messages +
                                            ChatMessage.Assistant(
                                                "$id-${agent.code}",
                                                if (agent ==
                                                    ChatAgent.Hermes
                                                ) {
                                                    HERMES_OFF_TEXT
                                                } else {
                                                    MODEL_OFF_TEXT
                                                },
                                            ),
                                )
                            }
                            return@launch
                        }
                        if (failure is ChatRequestException) {
                            fail(id, failure.failure)
                            return@launch
                        }
                        throw failure
                    }
                sessionId = sessionId ?: request.id
                knownRequests += request.id
                commit {
                    it.copy(
                        turns = upsertTurn(it.turns, ChatTurn(id, text, agent.route, running = true, trace = null)),
                        pending = ChatPending(id, pendingLabel(agent, request), request.id),
                    )
                }
                followRequest(id, request.id)
            }
        }

        /**
         * `/modelo`, `/claude`, `/openai` ou `/openrouter`: com as opções do servidor (as já lidas, ou lidas agora), escolhe o
         * provedor do comando (se ele tem chave aqui), liga o modo e, havendo mensagem depois do comando, a envia. Sem provedor
         * com chave o chat avisa e fica fora do modo; com o provedor do comando desligado, avisa e deixa o modo como estava.
         */
        private fun enterModelMode(
            id: String,
            provider: ModelProvider?,
            text: String?,
        ) {
            viewModelScope.launch {
                val picker =
                    try {
                        // Quem pede o modo quer saber agora se ele existe: sem opções lidas, pergunta de novo ao servidor.
                        models.picker(askAgain = true)
                    } catch (failure: Exception) {
                        if (failure is ModelOffException) {
                            following -= id
                            commit {
                                it.copy(
                                    agentMode = null,
                                    pending = null,
                                    messages = it.messages + ChatMessage.Assistant("$id-notice", MODEL_OFF_TEXT),
                                )
                            }
                            return@launch
                        }
                        if (failure is ChatRequestException) {
                            fail(id, failure.failure)
                            return@launch
                        }
                        throw failure
                    }
                if (id !in following) return@launch
                val options = picker.options
                if (provider != null && options.providerOf(provider) == null) {
                    following -= id
                    commit {
                        it.copy(
                            pending = null,
                            messages = it.messages + ChatMessage.Assistant("$id-notice", providerOffText(provider)),
                        )
                    }
                    return@launch
                }
                if (provider != null) models.chooseProvider(provider)
                val chosen = models.state.value.selection ?: picker.selection
                commit { it.copy(agentMode = ChatAgent.Model) }
                if (text == null) {
                    following -= id
                    commit {
                        it.copy(
                            pending = null,
                            messages = it.messages + ChatMessage.Assistant("$id-notice", modelEnterText(options, chosen)),
                        )
                    }
                    return@launch
                }
                runAgent(ChatAgent.Model, id, text)
            }
        }

        /**
         * Troca o modelo no seletor; com [provider], o provedor junto (a linha escolhida na aba dos favoritos ou de outro
         * provedor). Vale já e fica no aparelho.
         */
        fun chooseModel(
            model: String,
            provider: ModelProvider? = null,
        ) {
            viewModelScope.launch { models.chooseModel(model, provider) }
        }

        /** A estrela de uma linha da folha: guarda o modelo nos favoritos ou o tira de lá, sem escolhê-lo. */
        fun toggleFavorite(
            provider: ModelProvider,
            model: String,
        ) {
            viewModelScope.launch { models.toggleFavorite(provider, model) }
        }

        fun chooseEffort(effort: ModelEffort) {
            viewModelScope.launch { models.chooseEffort(effort) }
        }

        /** "Falando com Sonnet 5.5": a escolha é a do pedido; sem ela (um pedido antigo), a atual. */
        private fun pendingLabel(
            agent: ChatAgent,
            request: AgentRequest,
        ): String {
            val model = models.state.value
            return pendingLabelOf(agent, request.model ?: model.selection, model.options)
        }

        // endregion

        // region Acompanhar

        /** O app está à vista (resumido) ou não; fora de vista o chat deixa de reler o pedido e retoma ao voltar. */
        fun setVisible(value: Boolean) {
            visible.value = value
        }

        /**
         * Segue o pedido até o fim, a cada [ChatPolling.intervalMs]. O pedido já foi aceito pela API; se a consulta falhar, o
         * mesmo id (reenvio do "Tentar de novo") retoma o acompanhamento.
         */
        private suspend fun followRequest(
            id: String,
            requestId: String,
        ) {
            var elapsed = 0L
            var failures = 0
            while (id in following) {
                visible.first { it }
                if (id !in following) return
                try {
                    val view = repository.request(requestId)
                    failures = 0
                    if (id !in following) return
                    if (!isOpenRequest(view.status)) {
                        finishRequest(id, view)
                        return
                    }
                    applyView(id, view)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: ChatRequestException) {
                    failures += 1
                    if (failure.failure == ChatFailureCode.SessionExpired) {
                        fail(id, ChatFailureCode.SessionExpired)
                        return
                    }
                    if (failures >= polling.failuresLimit) {
                        fail(id, ChatFailureCode.ConnectionLost)
                        return
                    }
                }
                if (elapsed > polling.timeoutMs) {
                    fail(id, ChatFailureCode.ConnectionLost)
                    return
                }
                delay(polling.intervalMs)
                elapsed += polling.intervalMs
            }
        }

        /**
         * Mostra o estado do pedido na caixa de processo e no rastro da aba "Processo". O pedido por passos que o roteador não
         * reconhece vai ao Hermes: a caixa sai e a conversa segue como no `/hermes`, com os passos do rastro e a resposta. O
         * modo modelo segue do mesmo jeito.
         */
        private fun applyView(
            id: String,
            view: AgentRequest,
        ) {
            val processId = "$id-process"
            val agent = ChatAgent.of(view.route)
            commit { current ->
                var messages =
                    if (agent != null) {
                        current.messages.filter { it.id != processId }
                    } else {
                        current.messages.map { if (it.id == processId) ChatMessage.Process(processId, view) else it }
                    }
                // O Hermes e o modelo não gravam passos: os pensamentos e as ferramentas vêm do rastro, ao vivo e depois do fim.
                if (agent != null) {
                    val steps = hermesStepsOf(view.entries)
                    if (steps.isNotEmpty()) {
                        val stepsId = "$id-steps"
                        val message = ChatMessage.HermesSteps(stepsId, steps, isOpenRequest(view.status))
                        messages =
                            if (messages.any { it.id == stepsId }) {
                                messages.map {
                                    if (it.id ==
                                        stepsId
                                    ) {
                                        message
                                    } else {
                                        it
                                    }
                                }
                            } else {
                                messages + message
                            }
                    }
                }
                val pending = current.pending
                val label = agent?.let { pendingLabel(it, view) }
                current.copy(
                    messages = messages,
                    turns =
                        current.turns.map {
                            if (it.id ==
                                id
                            ) {
                                it.copy(
                                    route = agent?.route ?: RequestRoute.Steps,
                                    running = isOpenRequest(view.status),
                                    trace = view.trace,
                                )
                            } else {
                                it
                            }
                        },
                    pending =
                        if (label != null && isOpenRequest(view.status) && pending?.id == id && pending.label != label) {
                            pending.copy(label = label)
                        } else {
                            pending
                        },
                )
            }
        }

        /** O pedido terminou: feito (com a agenda atualizada se algo mudou), ou falhou / foi cancelado. */
        private fun finishRequest(
            id: String,
            view: AgentRequest,
        ) {
            applyView(id, view)
            if (view.status == TaskStatus.Done) {
                following -= id
                commit { current ->
                    val answer =
                        if (ChatAgent.of(view.route) != null) {
                            listOf(ChatMessage.Assistant("$id-answer", view.message.orEmpty(), model = view.model))
                        } else {
                            emptyList()
                        }
                    current.copy(
                        pending = if (current.pending?.id == id) null else current.pending,
                        messages = current.messages + answer,
                    )
                }
                // O agente pode ter mexido em qualquer registro; criar, editar e vincular mudam a agenda, uma consulta pura não.
                if (ChatAgent.of(view.route) != null || view.entities.isNotEmpty()) mutableEntitiesChanged.tryEmit(Unit)
                return
            }
            // Um pedido que falhou ou foi cancelado pode ter gravado algo antes de parar.
            if (view.entities.isNotEmpty()) mutableEntitiesChanged.tryEmit(Unit)
            // O agente desligado: o servidor escreve o aviso, que diz mais que o texto do código.
            val notice = if (ChatAgent.of(view.route) != null && view.errorCode == "unavailable") view.message else null
            fail(id, if (view.status == TaskStatus.Cancel) ChatFailureCode.Cancelled else ChatFailureCode.fromCode(view.errorCode), notice)
        }

        /** [text] troca o texto do código pelo que o servidor escreveu (o aviso do agente desligado). */
        private fun fail(
            id: String,
            code: ChatFailureCode,
            text: String? = null,
        ) {
            if (id !in following) return
            following -= id
            commit { current ->
                val request = current.messages.firstOrNull { it.id == id } as? ChatMessage.User
                current.copy(
                    pending = if (current.pending?.id == id) null else current.pending,
                    messages =
                        current.messages.map {
                            if (it.id == id && it is ChatMessage.User && code != ChatFailureCode.Cancelled) it.copy(failed = true) else it
                        } +
                            ChatMessage.Error(
                                id = "$id-error",
                                text = text ?: chatFailureText(code),
                                retryText = request?.text.orEmpty(),
                                messageId = id,
                                reuseMessageId = code.resumable,
                            ),
                    // O pedido acabou sem resposta: o rastro para de girar onde estava.
                    turns = current.turns.map { if (it.id == id) it.copy(running = false) else it },
                )
            }
            if (code == ChatFailureCode.ConnectionLost) mutableEntitiesChanged.tryEmit(Unit)
        }

        // endregion

        // region Tentar de novo, cancelar, recomeçar

        /** Tira o pedido que falhou e o erro dele, e manda o texto de novo (com o mesmo id, se a falha foi de rede). */
        fun retry(errorId: String) {
            val error = mutableState.value.messages.firstOrNull { it.id == errorId } as? ChatMessage.Error ?: return
            if (mutableState.value.pending != null) return
            commit { current ->
                current.copy(
                    messages =
                        current.messages.filter {
                            it.id != errorId &&
                                it.id != error.messageId &&
                                it.id != "${error.messageId}-process" &&
                                it.id != "${error.messageId}-steps"
                        },
                    turns = current.turns.filter { it.id != error.messageId },
                )
            }
            dispatch(error.retryText, if (error.reuseMessageId) error.messageId else newId())
        }

        /** Cancela o pedido aberto pela API. O que já foi gravado continua gravado; o pedido termina como cancelado. */
        fun cancel() {
            val current = mutableState.value.pending ?: return
            val requestId = current.requestId ?: return
            viewModelScope.launch {
                try {
                    val view = repository.cancel(requestId)
                    if (mutableState.value.pending?.id == current.id) finishRequest(current.id, view)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    // Sem resposta do cancelamento não se sabe o estado: o reenvio retoma o mesmo pedido.
                    fail(current.id, ChatFailureCode.ConnectionLost)
                }
            }
        }

        /**
         * Começar de novo é estado local: limpa a tela, a sessão e volta ao assistente da agenda. A escolha de modelo e o
         * seletor ficam no campo. Só sem pedido em andamento.
         */
        fun startNewConversation() {
            if (mutableState.value.pending != null) return
            reset()
            // O seletor continua no campo; as opções são lidas de novo, por trás, para a conversa nova.
            loadModels()
        }

        private fun reset() {
            following.clear()
            sessionId = null
            commit {
                it.copy(
                    messages = emptyList(),
                    turns = emptyList(),
                    pending = null,
                    agentMode = null,
                    pane = ChatPane.Conversation,
                    freeWindow = null,
                )
            }
        }

        // endregion

        /**
         * Ao abrir o chat: lê a lista de pedidos e volta a acompanhar os que ainda estão na fila, executando ou aguardando (rota
         * por passos, Hermes ou modelo), como um pedido recém-enviado. Não repete o que a conversa já mostra ou enviou, nem o que já
         * terminou. Um envio feito enquanto a lista é lida espera o fim dela. Sem lista (rede), a conversa segue.
         */
        private fun recover() {
            if (userId == null || recovering) return
            recovering = true
            viewModelScope.launch {
                // A lista vem do mais novo para o mais antigo; a conversa mostra do mais antigo para o mais novo.
                val open =
                    try {
                        repository
                            .recent()
                            .filter {
                                (it.route == RequestRoute.Steps || ChatAgent.of(it.route) != null) &&
                                    isOpenRequest(it.status) &&
                                    it.id !in knownRequests
                            }.reversed()
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (_: ChatRequestException) {
                        // Sem a lista, o que estava em aberto não volta; a conversa continua como estava.
                        emptyList()
                    }
                recovering = false
                if (open.isNotEmpty()) restore(open)
                deferred.toList().also { deferred.clear() }.forEach { it() }
            }
        }

        private fun restore(open: List<AgentRequest>) {
            val restored = mutableListOf<ChatMessage>()
            for (request in open) {
                knownRequests += request.id
                following += request.id
                restored += ChatMessage.User(request.id, request.text ?: request.title)
                if (request.route == RequestRoute.Steps) restored += ChatMessage.Process("${request.id}-process", request)
            }
            val newest = open.last()
            commit { current ->
                current.copy(
                    messages = restored + current.messages,
                    turns = open.map { ChatTurn(it.id, it.text ?: it.title, it.route, running = true, trace = null) } + current.turns,
                    pending =
                        current.pending
                            ?: ChatPending(
                                newest.id,
                                ChatAgent.of(newest.route)?.let { pendingLabel(it, newest) } ?: STEPS_PENDING_LABEL,
                                newest.id,
                            ),
                )
            }
            for (request in open) viewModelScope.launch { followRequest(request.id, request.id) }
        }

        private fun upsertTurn(
            turns: List<ChatTurn>,
            next: ChatTurn,
        ): List<ChatTurn> = if (turns.any { it.id == next.id }) turns.map { if (it.id == next.id) next else it } else turns + next

        /** Aplica a mudança e acompanha o robô do botão: pensa enquanto há pedido e mostra o desfecho por um instante. */
        private fun commit(change: (ChatUiState) -> ChatUiState) {
            val after = change(mutableState.value)
            if (after.pending != null) {
                botThinking = true
                botTimer?.cancel()
                baseBot = BotState.Thinking
            } else if (botThinking) {
                botThinking = false
                val failed = after.messages.lastOrNull() is ChatMessage.Error
                baseBot = if (failed) BotState.Error else BotState.Done
                botTimer?.cancel()
                botTimer =
                    viewModelScope.launch {
                        delay(if (failed) BOT_ERROR_MS else BOT_DONE_MS)
                        baseBot = BotState.Idle
                        mutableState.value = withBot(mutableState.value)
                    }
            }
            // A escolha de modelo vem sempre do seletor: uma mudança dela que chegou durante esta não se perde.
            mutableState.value = withBot(after).copy(model = models.state.value)
            tryAutoListen()
        }

        private fun withBot(state: ChatUiState): ChatUiState = state.copy(bot = if (state.voice.listening) BotState.Listening else baseBot)

        // region Voz

        /** Sincroniza o campo: a tela diz o que está escrito para a fala ser somada a isso. Não mexe no microfone. */
        fun syncDraft(text: String) {
            draft = text
        }

        /** A pessoa digitou: a primeira tecla desliga o microfone, sem entregar a fala, e ele não liga mais sozinho. */
        fun typed(text: String) {
            draft = text
            userTyped = true
            autoListen = false
            dictation.cancel()
            refreshVoice()
        }

        /** O botão do microfone: parado, liga (e mostra os erros); ouvindo, para e a transcrição vai para o campo. */
        fun toggleVoice() {
            if (dictation.state.value.listening) {
                dictation.stop()
                refreshVoice()
                return
            }
            val current = mutableState.value
            if (!current.ready || current.pending != null) return
            beginListening(auto = false)
        }

        /** A resposta do pedido de permissão do sistema. Negada, só explica quando a pessoa foi quem tocou no microfone. */
        fun microphoneResult(granted: Boolean) {
            if (!askingPermission) return
            askingPermission = false
            val auto = askedByAuto
            if (!granted) {
                permissionDenied = true
                if (!auto) permissionNotice = speechErrorMessage(SpeechError.NotAllowed)
                refreshVoice()
                return
            }
            permissionDenied = false
            val current = mutableState.value
            if (!current.open || (auto && (userTyped || current.pending != null))) {
                refreshVoice()
                return
            }
            dictation.start()
        }

        /** A tela saiu de vista ou o chat fechou: o microfone desliga. */
        fun pauseVoice() {
            autoListen = false
            dictation.cancel()
            refreshVoice()
        }

        override fun onCleared() {
            dictation.cancel()
            super.onCleared()
        }

        private fun beginListening(auto: Boolean) {
            if (!speech.available) return
            quietVoice = auto
            permissionNotice = null
            if (!microphone.isGranted()) {
                // Negada uma vez, o chat não volta a pedir sozinho a cada abertura; só um toque no microfone pede de novo.
                if (auto && permissionDenied) return
                askedByAuto = auto
                askingPermission = true
                refreshVoice()
                return
            }
            dictation.start()
        }

        private fun tryAutoListen() {
            if (!autoListen) return
            if (userTyped) {
                autoListen = false
                return
            }
            val current = mutableState.value
            if (!current.open || !current.ready || current.pending != null) return
            autoListen = false
            beginListening(auto = true)
        }

        /**
         * O que a pessoa disse e o silêncio enviou: a fala que manda parar não vai, o resto vai para a IA. Depois da resposta
         * o microfone fica desligado; quem quer falar de novo toca nele.
         */
        private fun sendSpoken(transcript: String) {
            if (isStopSpeech(transcript)) return
            val text = appendTranscript(draft, transcript)
            if (parseCommand(text) == null && sendWithWindow(text)) {
                fillPrompt("")
                return
            }
            // Um comando "/" ou a IA ocupada: o que foi dito cai no campo para a pessoa decidir.
            fillPrompt(text)
        }

        private fun fillPrompt(text: String) {
            draft = text
            mutablePromptEdits.tryEmit(text)
        }

        private fun refreshVoice() {
            val heard = dictation.state.value
            val message = heard.error?.let(::speechErrorMessage)
            val notice = permissionNotice ?: if (!quietVoice) message else null
            val voice = VoiceUiState(speech.available, heard.listening, heard.heard, notice, askingPermission)
            if (voice != mutableState.value.voice) mutableState.value = withBot(mutableState.value.copy(voice = voice))
        }

        // endregion
    }
