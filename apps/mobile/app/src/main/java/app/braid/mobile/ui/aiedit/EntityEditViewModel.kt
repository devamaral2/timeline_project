package app.braid.mobile.ui.aiedit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.chat.ModelPicker
import app.braid.mobile.domain.chat.ModelSelector
import app.braid.mobile.domain.polling.AGENT_POLL_MS
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentRequestRepository
import app.braid.mobile.domain.request.EDIT_LISTENING_TEXT
import app.braid.mobile.domain.request.EDIT_LOST_TEXT
import app.braid.mobile.domain.request.EDIT_TIMEOUT_TEXT
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.PROMPT_MAX_LENGTH
import app.braid.mobile.domain.request.RequestFollow
import app.braid.mobile.domain.request.agentFailureText
import app.braid.mobile.domain.request.appendTranscript
import app.braid.mobile.domain.request.followRequest
import app.braid.mobile.domain.request.runningStepLabel
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.speech.MicrophonePermission
import app.braid.mobile.domain.speech.SpeechRecognizer
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.chat.VoiceUiState
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class EditPhase { Idle, Sending, Running, Done, Failed }

data class EntityEditUiState(
    val draft: String = "",
    val phase: EditPhase = EditPhase.Idle,
    /** O último estado lido do pedido que a barra acompanha: os passos e o progresso saem dele. */
    val request: AgentRequest? = null,
    /** O texto de falha (envio, pedido que falhou ou foi cancelado, conexão perdida). */
    val error: String? = null,
    val voice: VoiceUiState = VoiceUiState(),
    /** O seletor de modelo do campo, o mesmo do chat; `null` sem as opções do servidor (o campo fica simples). */
    val picker: ModelPicker? = null,
) {
    val busy: Boolean get() = phase == EditPhase.Sending || phase == EditPhase.Running
    val canDismiss: Boolean get() = phase == EditPhase.Done || phase == EditPhase.Failed
    val failed: Boolean get() = phase == EditPhase.Failed

    /** A resposta do agente (pedido pronto) ou o motivo da falha. */
    val message: String? get() = if (failed) error else request?.message

    val statusText: String
        get() =
            when {
                voice.listening -> EDIT_LISTENING_TEXT
                phase == EditPhase.Done -> "Pronto"
                phase == EditPhase.Failed -> "Não deu certo"
                busy -> request?.progress ?: request?.let { runningStepLabel(it.steps) } ?: "Entendendo o pedido…"
                else -> "Esperando o seu pedido"
            }
}

/**
 * A barra de edição por IA no rodapé dos detalhes (ADR 0006): o que se escreve edita a entidade aberta. Abre o pedido com
 * o tipo e o id da entidade (`POST /api/requests/edit`) e o acompanha com [AGENT_POLL_MS] de intervalo, a primeira leitura
 * só depois da primeira espera, até 180 s. Uma edição por vez. Terminado com entidades mexidas, [edited] avisa para a tela
 * reler a entidade. O microfone só dita: acrescenta ao campo, nunca envia sozinho. O campo mostra a escolha de provedor,
 * modelo e esforço do app ([ModelSelector], a mesma do chat) e cada pedido a leva.
 */
@HiltViewModel(assistedFactory = EntityEditViewModel.Factory::class)
class EntityEditViewModel
    @AssistedInject
    constructor(
        @Assisted private val entityType: EditEntityType,
        @Assisted private val entityId: String,
        private val requests: AgentRequestRepository,
        private val session: SessionRepository,
        private val clock: AppClock,
        private val speech: SpeechRecognizer,
        private val microphone: MicrophonePermission,
        private val models: ModelSelector,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(
                entityType: EditEntityType,
                entityId: String,
            ): EntityEditViewModel
        }

        private val mutableState = MutableStateFlow(EntityEditUiState())
        val state: StateFlow<EntityEditUiState> = mutableState.asStateFlow()

        private val mutableEdited = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

        /** O pedido terminou e mexeu em algo: a tela relê a entidade. */
        val edited: SharedFlow<Unit> = mutableEdited.asSharedFlow()

        /** O acompanhamento só anda com a tela à vista. */
        private val visible = MutableStateFlow(true)

        private val dictation =
            DraftDictation(
                speech,
                microphone,
                viewModelScope,
                onVoice = { voice -> mutableState.update { if (it.voice == voice) it else it.copy(voice = voice) } },
                onTranscript = { transcript -> mutableState.update { it.copy(draft = appendTranscript(it.draft, transcript)) } },
            )

        init {
            viewModelScope.launch { models.state.collect { model -> mutableState.update { it.copy(picker = model.picker) } } }
            // A barra apareceu: lê o que o servidor oferece. Sem as opções o campo fica simples e o pedido vai sem escolha.
            viewModelScope.launch { models.load() }
        }

        fun onDraftChange(text: String) = mutableState.update { it.copy(draft = text.take(PROMPT_MAX_LENGTH)) }

        /**
         * A tela está à vista ou não; fora de vista o microfone desliga e o acompanhamento espera. Voltar a ela é a barra
         * aparecer de novo: as opções de modelo são relidas, por trás (e uma leitura que tinha falhado ganha outra chance).
         */
        fun setVisible(value: Boolean) {
            val returned = value && !visible.value
            visible.value = value
            if (!value) dictation.cancel()
            if (returned) viewModelScope.launch { models.load() }
        }

        /** As trocas do seletor: valem já, em todas as telas, ficam no aparelho e vão no próximo pedido (mesmo com um em andamento). */
        fun chooseProvider(provider: ModelProvider) {
            viewModelScope.launch { models.chooseProvider(provider) }
        }

        fun chooseModel(model: String) {
            viewModelScope.launch { models.chooseModel(model) }
        }

        fun chooseEffort(effort: ModelEffort) {
            viewModelScope.launch { models.chooseEffort(effort) }
        }

        /**
         * Envia o campo, com a escolha de modelo que ele mostra (um envio antes de as opções chegarem espera por elas; sem o
         * modo modelo, vai sem escolha). Falha de envio devolve o texto ao campo.
         */
        fun submit() {
            val current = mutableState.value
            val text = current.draft.trim()
            if (text.isEmpty() || current.busy) return
            val userId = (session.state.value as? SessionState.SignedIn)?.user?.userId ?: return
            dictation.cancel()
            mutableState.update { it.copy(draft = "", phase = EditPhase.Sending, request = null, error = null) }
            viewModelScope.launch {
                val id =
                    try {
                        requests.startEdit(userId, text, entityType, entityId, models.selectionForRequest())
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (failure: Exception) {
                        mutableState.update {
                            it.copy(phase = EditPhase.Failed, error = agentFailureText(startFailureCode(failure)), draft = text)
                        }
                        return@launch
                    }
                mutableState.update { it.copy(phase = EditPhase.Running) }
                follow(id)
            }
        }

        /** "Fechar resultado": só com o pedido terminado ou falho. */
        fun dismiss() {
            if (!mutableState.value.canDismiss) return
            mutableState.update { it.copy(phase = EditPhase.Idle, request = null, error = null) }
        }

        private suspend fun follow(id: String) {
            // Ao contrário da barra do arquivo, a primeira leitura só vem depois da primeira espera (como no web).
            val outcome =
                followRequest(
                    clock = clock,
                    read = { requests.request(id) },
                    onRead = { view -> mutableState.update { it.copy(request = view) } },
                    beforeRead = { visible.first { it } },
                )
            when (outcome) {
                is RequestFollow.Closed -> finish(outcome.request)
                RequestFollow.Lost -> fail(EDIT_LOST_TEXT)
                RequestFollow.TimedOut -> fail(EDIT_TIMEOUT_TEXT)
            }
        }

        private fun finish(view: AgentRequest) {
            if (view.status == TaskStatus.Done) {
                mutableState.update { it.copy(phase = EditPhase.Done) }
                if (view.entities.isNotEmpty()) mutableEdited.tryEmit(Unit)
            } else {
                fail(agentFailureText(view.errorCode ?: if (view.status == TaskStatus.Cancel) "cancelled" else "internal"))
            }
        }

        private fun fail(text: String) = mutableState.update { it.copy(phase = EditPhase.Failed, error = text) }

        /** O botão do microfone: parado, liga; ouvindo, para e o que foi ouvido vai para o campo. */
        fun toggleVoice() = dictation.toggle(blocked = mutableState.value.busy)

        /** A resposta do pedido de permissão do sistema: negada, diz por quê; concedida, liga a escuta. */
        fun microphoneResult(granted: Boolean) = dictation.permissionResult(granted)

        override fun onCleared() {
            dictation.cancel()
            super.onCleared()
        }
    }
