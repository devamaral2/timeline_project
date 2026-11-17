package app.braid.mobile.ui.aiedit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentRequestRepository
import app.braid.mobile.domain.request.EDIT_LISTENING_TEXT
import app.braid.mobile.domain.request.EDIT_LOST_TEXT
import app.braid.mobile.domain.request.EDIT_TIMEOUT_TEXT
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.agentFailureText
import app.braid.mobile.domain.request.isOpenRequest
import app.braid.mobile.domain.request.runningStepLabel
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.speech.MicrophonePermission
import app.braid.mobile.domain.speech.SpeechDictation
import app.braid.mobile.domain.speech.SpeechError
import app.braid.mobile.domain.speech.SpeechRecognizer
import app.braid.mobile.domain.speech.speechErrorMessage
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.agenda.AGENT_POLL_MS
import app.braid.mobile.ui.chat.VoiceUiState
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
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
import java.time.Duration

const val ENTITY_EDIT_MAX_LENGTH = 4000

/** O tempo que a barra espera o pedido terminar antes de desistir de acompanhá-lo. */
const val ENTITY_EDIT_TIMEOUT_MS = 180_000L

/** Falhas seguidas ao ler o pedido antes de desistir de acompanhá-lo. */
const val ENTITY_EDIT_POLL_FAILURES = 5

enum class EditPhase { Idle, Sending, Running, Done, Failed }

data class EntityEditUiState(
    val draft: String = "",
    val phase: EditPhase = EditPhase.Idle,
    /** O último estado lido do pedido que a barra acompanha: os passos e o progresso saem dele. */
    val request: AgentRequest? = null,
    /** O texto de falha (envio, pedido que falhou ou foi cancelado, conexão perdida). */
    val error: String? = null,
    val voice: VoiceUiState = VoiceUiState(),
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
 * reler a entidade. O microfone só dita: acrescenta ao campo, nunca envia sozinho.
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
        private var askingPermission = false
        private var permissionNotice: String? = null

        private val dictation =
            SpeechDictation(
                recognizer = speech,
                scope = viewModelScope,
                onFinalTranscript = { transcript ->
                    mutableState.update {
                        it.copy(
                            draft = (if (it.draft.isNotEmpty()) "${it.draft} $transcript" else transcript).take(MAX),
                        )
                    }
                },
            )

        init {
            viewModelScope.launch { dictation.state.collect { refreshVoice() } }
        }

        fun onDraftChange(text: String) = mutableState.update { it.copy(draft = text.take(MAX)) }

        /** A tela está à vista ou não; fora de vista o microfone desliga e o acompanhamento espera. */
        fun setVisible(value: Boolean) {
            visible.value = value
            if (!value) {
                dictation.cancel()
                askingPermission = false
                refreshVoice()
            }
        }

        /** Envia o campo. Falha de envio devolve o texto ao campo. */
        fun submit() {
            val current = mutableState.value
            val text = current.draft.trim()
            if (text.isEmpty() || current.busy) return
            val userId = (session.state.value as? SessionState.SignedIn)?.user?.userId ?: return
            dictation.cancel()
            mutableState.update { it.copy(draft = "", phase = EditPhase.Sending, request = null, error = null) }
            refreshVoice()
            viewModelScope.launch {
                val id =
                    try {
                        requests.startEdit(userId, text, entityType, entityId)
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
            val startedAt = clock.now()
            var failures = 0
            while (true) {
                // Ao contrário da barra do arquivo, a primeira leitura só vem depois da primeira espera (como no web).
                delay(AGENT_POLL_MS)
                visible.first { it }
                try {
                    val view = requests.request(id)
                    failures = 0
                    mutableState.update { it.copy(request = view) }
                    if (!isOpenRequest(view.status)) {
                        finish(view)
                        return
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    failures += 1
                    if (failures >= ENTITY_EDIT_POLL_FAILURES) {
                        fail(EDIT_LOST_TEXT)
                        return
                    }
                }
                if (Duration.between(startedAt, clock.now()).toMillis() > ENTITY_EDIT_TIMEOUT_MS) {
                    fail(EDIT_TIMEOUT_TEXT)
                    return
                }
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
        fun toggleVoice() {
            if (dictation.state.value.listening) {
                dictation.stop()
                return
            }
            if (!speech.available || mutableState.value.busy) return
            permissionNotice = null
            if (!microphone.isGranted()) {
                askingPermission = true
                refreshVoice()
                return
            }
            dictation.start()
        }

        /** A resposta do pedido de permissão do sistema: negada, diz por quê; concedida, liga a escuta. */
        fun microphoneResult(granted: Boolean) {
            if (!askingPermission) return
            askingPermission = false
            if (!granted) {
                permissionNotice = speechErrorMessage(SpeechError.NotAllowed)
                refreshVoice()
                return
            }
            dictation.start()
        }

        override fun onCleared() {
            dictation.cancel()
            super.onCleared()
        }

        private fun refreshVoice() {
            val heard = dictation.state.value
            val notice = permissionNotice ?: heard.error?.let(::speechErrorMessage)
            val voice = VoiceUiState(speech.available, heard.listening, heard.heard, notice, askingPermission)
            mutableState.update { if (it.voice == voice) it else it.copy(voice = voice) }
        }

        private companion object {
            const val MAX = ENTITY_EDIT_MAX_LENGTH
        }
    }
