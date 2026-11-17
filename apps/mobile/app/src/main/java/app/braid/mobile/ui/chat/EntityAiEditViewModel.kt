package app.braid.mobile.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.chat.ProcessGateway
import app.braid.mobile.data.chat.ProcessPoll
import app.braid.mobile.data.chat.ProcessStart
import app.braid.mobile.data.dto.AiProcessDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class EntityAiEditPhase { Idle, Sending, Running, Done, Failed }

/** O pedido de edição em andamento (ou o último resultado) da tela de detalhe. */
data class EntityAiEditUiState(
    val phase: EntityAiEditPhase = EntityAiEditPhase.Idle,
    val process: AiProcessDto? = null,
    val error: String? = null,
) {
    val busy: Boolean get() = phase == EntityAiEditPhase.Sending || phase == EntityAiEditPhase.Running
}

sealed interface EntityAiEditEffect {
    /** O processo terminou e alterou algo: a tela recarrega a entidade. */
    data object Edited : EntityAiEditEffect
}

/**
 * A conversa de edição da entidade aberta (ADR 006, `useEntityAiEdit` do web): envia o pedido com o tipo e o id da
 * entidade e acompanha o processo até o fim. Um pedido por vez; ao terminar com sucesso a tela é avisada.
 */
@HiltViewModel
class EntityAiEditViewModel
    @Inject
    constructor(
        private val processes: ProcessGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(EntityAiEditUiState())
        private val mutableEffects = MutableSharedFlow<EntityAiEditEffect>(extraBufferCapacity = 4)

        /** Intervalo entre consultas ao processo; os testes o encurtam. */
        internal var pollMillis = POLL_MILLIS

        val state: StateFlow<EntityAiEditUiState> = mutableState.asStateFlow()
        val effects: SharedFlow<EntityAiEditEffect> = mutableEffects.asSharedFlow()

        /** Devolve `false` quando o pedido não saiu (vazio, grande demais, ou já há outro em andamento). */
        fun submit(
            text: String,
            entityType: String,
            entityId: String,
        ): Boolean {
            val trimmed = text.trim()
            if (trimmed.isEmpty() || trimmed.length > MAX_LENGTH || mutableState.value.busy) return false
            mutableState.value = EntityAiEditUiState(phase = EntityAiEditPhase.Sending)
            viewModelScope.launch { run(trimmed, entityType, entityId) }
            return true
        }

        /** Fecha o resultado; durante um pedido não faz nada. */
        fun dismiss() {
            if (!mutableState.value.busy) mutableState.value = EntityAiEditUiState()
        }

        private suspend fun run(
            text: String,
            entityType: String,
            entityId: String,
        ) {
            val processId =
                when (val start = processes.startEdit(text, entityType, entityId)) {
                    is ProcessStart.Started -> start.processId
                    is ProcessStart.Failed -> return fail(startFailureText(start.status))
                }
            mutableState.value = EntityAiEditUiState(phase = EntityAiEditPhase.Running)
            var failures = 0
            var waited = 0L
            while (true) {
                delay(pollMillis)
                waited += pollMillis
                when (val poll = processes.get(processId)) {
                    is ProcessPoll.View -> {
                        failures = 0
                        val view = poll.process
                        if (view.terminal) return finish(view)
                        mutableState.value = EntityAiEditUiState(phase = EntityAiEditPhase.Running, process = view)
                    }

                    is ProcessPoll.Failed -> {
                        failures += 1
                        if (poll.status == 401) return fail(SESSION_EXPIRED)
                        if (failures >= POLL_FAILURES) return fail(CONNECTION_LOST)
                    }
                }
                if (waited >= TIMEOUT_MILLIS) return fail(TIMEOUT)
            }
        }

        private fun finish(view: AiProcessDto) {
            if (view.status == "completed") {
                mutableState.value = EntityAiEditUiState(phase = EntityAiEditPhase.Done, process = view)
                if (view.entities.isNotEmpty()) mutableEffects.tryEmit(EntityAiEditEffect.Edited)
            } else {
                mutableState.value = EntityAiEditUiState(phase = EntityAiEditPhase.Failed, process = view, error = view.message ?: GENERIC)
            }
        }

        private fun fail(message: String) {
            mutableState.value = EntityAiEditUiState(phase = EntityAiEditPhase.Failed, error = message)
        }

        internal companion object {
            const val MAX_LENGTH = 4000
            const val POLL_MILLIS = 1_000L
            const val TIMEOUT_MILLIS = 180_000L
            const val POLL_FAILURES = 5
            const val GENERIC = "Algo deu errado. Tente de novo."
            const val FORBIDDEN = "Você não tem permissão para editar isto."
            const val INVALID = "Não consegui ler esse pedido. Tente escrever de outro jeito."
            const val UNAVAILABLE = "A IA está indisponível agora. Tente de novo em instantes."
            const val SESSION_EXPIRED = "Sua sessão acabou. Entre de novo para continuar."
            const val CONNECTION_LOST = "Perdi a conexão antes da resposta. Confira se a mudança foi feita antes de repetir."
            const val TIMEOUT = "O pedido demorou demais. Confira se a mudança foi feita antes de repetir."

            fun startFailureText(status: Int?): String =
                when (status) {
                    401 -> SESSION_EXPIRED
                    403 -> FORBIDDEN
                    400 -> INVALID
                    404, 503 -> UNAVAILABLE
                    else -> GENERIC
                }
        }
    }
