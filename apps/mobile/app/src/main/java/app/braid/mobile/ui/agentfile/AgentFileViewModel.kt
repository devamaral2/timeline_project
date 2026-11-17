package app.braid.mobile.ui.agentfile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.agentfile.AgentFileBackup
import app.braid.mobile.domain.agentfile.AgentFileForbiddenException
import app.braid.mobile.domain.agentfile.AgentFileRepository
import app.braid.mobile.domain.agentfile.HermesOffException
import app.braid.mobile.domain.artifact.AgentFileData
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentRequestRepository
import app.braid.mobile.domain.request.agentFailureText
import app.braid.mobile.domain.request.isOpenRequest
import app.braid.mobile.domain.request.runningStepLabel
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.ui.agenda.AGENT_POLL_MS
import app.braid.mobile.ui.aiedit.startFailureCode
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

const val FILE_READ_FAILED_TEXT = "Não foi possível ler o arquivo."
const val BACKUPS_FAILED_TEXT = "Não foi possível carregar os backups."
const val RESTORE_FAILED_TEXT = "Não foi possível restaurar este backup. Tente novamente."
const val EDIT_LOST_TEXT = "Perdi a conexão antes da resposta. Confira o arquivo antes de repetir."
const val HERMES_OFF_TEXT = "O Hermes está desligado neste servidor."
const val EDIT_DRAFT_MAX_LENGTH = 4000

/** Falhas seguidas ao consultar o pedido antes de desistir de acompanhá-lo. */
const val EDIT_POLL_FAILURES = 5

/** O texto do arquivo: o dono o lê; quem não é recebe 403, o que não é erro para a tela. */
sealed interface FileRead {
    data object Loading : FileRead

    data class Ready(
        val text: String,
    ) : FileRead

    data object Forbidden : FileRead

    data object Error : FileRead
}

sealed interface BackupsState {
    /** Ainda não pedidos: só se pede depois de saber que o usuário lê o texto. */
    data object Idle : BackupsState

    data object Loading : BackupsState

    data class Ready(
        val backups: List<AgentFileBackup>,
    ) : BackupsState

    data object Error : BackupsState
}

/** A confirmação de restaurar um backup. */
data class RestoreDialog(
    val backup: AgentFileBackup,
    val busy: Boolean = false,
    val error: String? = null,
)

/** O campo de pedir uma edição ao Hermes e o pedido que ele acompanha. */
data class EditBar(
    val draft: String = "",
    val sending: Boolean = false,
    val error: String? = null,
    /** A API respondeu 404: a automação está desligada neste servidor, e o campo dá lugar ao aviso. */
    val hermesOff: Boolean = false,
    /** O pedido que o campo abriu nesta tela; `null` enquanto nenhum foi aberto ou depois de "Fechar". */
    val followed: AgentRequest? = null,
    /** Cinco leituras seguidas falharam: o campo deixou de acompanhar o pedido. */
    val lost: Boolean = false,
) {
    val open: Boolean get() = followed != null && isOpenRequest(followed.status)
    val finished: Boolean get() = followed != null && !open
    val busy: Boolean get() = sending || open
    val canSend: Boolean get() = !busy && draft.isNotBlank()
    val canDismiss: Boolean get() = finished || lost
    val failed: Boolean get() = followed?.status == TaskStatus.Failed
    val hasFailure: Boolean get() = error != null || failed || lost

    /** O que o pedido respondeu: a mensagem do Hermes, o motivo da falha ou o aviso de que a conexão caiu. */
    val message: String?
        get() =
            when {
                lost -> EDIT_LOST_TEXT
                followed?.status == TaskStatus.Done -> followed.message
                failed -> agentFailureText(followed?.errorCode ?: "internal")
                followed?.status == TaskStatus.Cancel -> agentFailureText("cancelled")
                else -> null
            }

    /** O texto grande do resultado: o erro de envio, senão [message]. */
    val shown: String? get() = error ?: message

    val statusText: String
        get() =
            when {
                sending -> "Enviando o pedido…"
                lost -> "Não consegui acompanhar o pedido"
                open -> followed?.progress ?: followed?.let { runningStepLabel(it.steps) } ?: "Entendendo o pedido…"
                followed?.status == TaskStatus.Done -> "Pronto"
                failed -> "Não deu certo"
                followed?.status == TaskStatus.Cancel -> "Pedido cancelado"
                else -> "Esperando o seu pedido"
            }
}

data class AgentFileUiState(
    val path: String,
    /** A versão do arquivo: a do documento, trocada pela que a restauração devolve. */
    val hash: String,
    /** O arquivo saiu da pasta: o texto é o último conhecido. */
    val missing: Boolean,
    val read: FileRead = FileRead.Loading,
    /** O texto cru em vez do markdown. */
    val raw: Boolean = false,
    val backups: BackupsState = BackupsState.Idle,
    val restore: RestoreDialog? = null,
    val edit: EditBar = EditBar(),
) {
    /** Quem não é o dono não vê texto, backups nem campo de pedido. */
    val forbidden: Boolean get() = read == FileRead.Forbidden
}

/**
 * O arquivo de uma skill ou agente do Hermes (ADR 0005): lê o texto, os backups e restaura um deles, e pede ao Hermes
 * uma edição acompanhando o pedido a cada [AGENT_POLL_MS] (só com a tela à vista) até ele terminar, quando relê o texto.
 */
@HiltViewModel(assistedFactory = AgentFileViewModel.Factory::class)
class AgentFileViewModel
    @AssistedInject
    constructor(
        @Assisted file: AgentFileData,
        private val files: AgentFileRepository,
        private val requests: AgentRequestRepository,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(file: AgentFileData): AgentFileViewModel
        }

        private val mutableState = MutableStateFlow(AgentFileUiState(file.path, file.hash, file.missing))
        val state: StateFlow<AgentFileUiState> = mutableState.asStateFlow()
        private val path = file.path
        private var visible = false
        private var textJob: Job? = null
        private var backupsJob: Job? = null
        private var pollJob: Job? = null
        private var pollFailures = 0
        private var notifiedId: String? = null

        init {
            loadText()
        }

        /** A tela está à vista (resumida) ou não: o acompanhamento do pedido só anda com ela à vista. */
        fun setVisible(value: Boolean) {
            visible = value
            syncPolling()
        }

        fun setRaw(raw: Boolean) = mutableState.update { it.copy(raw = raw) }

        /** Lê o texto; o anterior fica na tela até o novo chegar. Vale para a primeira leitura e as releituras. */
        private fun loadText() {
            textJob?.cancel()
            textJob =
                viewModelScope.launch {
                    val read =
                        try {
                            FileRead.Ready(files.text(path))
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (forbidden: AgentFileForbiddenException) {
                            FileRead.Forbidden
                        } catch (failure: Exception) {
                            FileRead.Error
                        }
                    mutableState.update { it.copy(read = read) }
                    // Só depois de saber que o usuário pode ler o texto: quem não é o dono não chega a pedir os backups.
                    if (read !is FileRead.Forbidden && mutableState.value.backups == BackupsState.Idle) loadBackups()
                }
        }

        private fun loadBackups() {
            backupsJob?.cancel()
            // Depois de uma restauração a lista antiga fica na tela até a nova chegar.
            mutableState.update { if (it.backups is BackupsState.Ready) it else it.copy(backups = BackupsState.Loading) }
            backupsJob =
                viewModelScope.launch {
                    val backups =
                        try {
                            BackupsState.Ready(files.backups(path))
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (failure: Exception) {
                            BackupsState.Error
                        }
                    mutableState.update { it.copy(backups = backups) }
                }
        }

        fun askRestore(backup: AgentFileBackup) = mutableState.update { it.copy(restore = RestoreDialog(backup)) }

        /** Fecha a confirmação; enquanto a restauração roda, ela não fecha. */
        fun cancelRestore() = mutableState.update { if (it.restore?.busy == true) it else it.copy(restore = null) }

        /**
         * Restaura o backup da confirmação. A versão e o aviso de ausência passam a ser os da resposta; versão nova
         * relê o texto, e a lista de backups é lida de novo (o texto substituído virou um backup).
         */
        fun confirmRestore() {
            val dialog = mutableState.value.restore ?: return
            if (dialog.busy) return
            mutableState.update { it.copy(restore = dialog.copy(busy = true, error = null)) }
            viewModelScope.launch {
                try {
                    val version = files.restore(path, dialog.backup.id)
                    val changed = version != null && version.hash != mutableState.value.hash
                    mutableState.update {
                        val next = it.copy(restore = null)
                        if (version == null) next else next.copy(hash = version.hash, missing = version.missing)
                    }
                    if (changed) loadText()
                    loadBackups()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    mutableState.update { it.copy(restore = dialog.copy(busy = false, error = RESTORE_FAILED_TEXT)) }
                }
            }
        }

        fun onDraftChange(text: String) = updateEdit { it.copy(draft = text.take(EDIT_DRAFT_MAX_LENGTH)) }

        /** Pede a edição ao Hermes e passa a acompanhar o pedido. Falha mantém o texto e avisa. */
        fun send() {
            val bar = mutableState.value.edit
            val message = bar.draft.trim()
            if (bar.busy || message.isEmpty() || bar.hermesOff) return
            updateEdit { it.copy(sending = true, error = null, lost = false) }
            viewModelScope.launch {
                try {
                    val accepted = files.requestEdit(path, message, UUID.randomUUID().toString())
                    pollFailures = 0
                    updateEdit { it.copy(sending = false, draft = "") }
                    follow(accepted)
                    syncPolling()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (off: HermesOffException) {
                    updateEdit { it.copy(sending = false, hermesOff = true) }
                } catch (failure: Exception) {
                    updateEdit { it.copy(sending = false, error = agentFailureText(startFailureCode(failure))) }
                }
            }
        }

        /** "Fechar resultado": só quando o pedido terminou ou se perdeu. */
        fun dismiss() {
            if (!mutableState.value.edit.canDismiss) return
            pollFailures = 0
            updateEdit { it.copy(followed = null, lost = false, error = null) }
        }

        /** Guarda o pedido que o campo acompanha; ao terminar (uma vez por pedido), o texto do arquivo é relido. */
        private fun follow(view: AgentRequest) {
            updateEdit { it.copy(followed = view) }
            if (!isOpenRequest(view.status) && notifiedId != view.id) {
                notifiedId = view.id
                loadText()
            }
        }

        private fun syncPolling() {
            if (!visible || !following()) {
                pollJob?.cancel()
                pollJob = null
                return
            }
            if (pollJob?.isActive == true) return
            pollJob =
                viewModelScope.launch {
                    while (visible && following()) {
                        readFollowed()
                        if (!following()) break
                        delay(AGENT_POLL_MS)
                    }
                }
        }

        private fun following(): Boolean {
            val bar = mutableState.value.edit
            return bar.open && !bar.lost
        }

        /** Uma leitura do pedido; cinco falhas seguidas desistem de acompanhá-lo. */
        private suspend fun readFollowed() {
            val id =
                mutableState.value.edit.followed
                    ?.id ?: return
            try {
                val view = requests.request(id)
                pollFailures = 0
                follow(view)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                pollFailures += 1
                if (pollFailures >= EDIT_POLL_FAILURES) updateEdit { it.copy(lost = true) }
            }
        }

        private fun updateEdit(transform: (EditBar) -> EditBar) = mutableState.update { it.copy(edit = transform(it.edit)) }
    }
