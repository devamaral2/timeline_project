package app.braid.mobile.ui.documents

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactNotFoundException
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.domain.artifact.FoodGeneration
import app.braid.mobile.domain.artifact.isFreeText
import app.braid.mobile.domain.polling.MEAL_POLL_MS
import app.braid.mobile.domain.polling.PollingLoop
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.editEntityTypeOfArtifact
import app.braid.mobile.domain.time.AppClock
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

const val FAILED_DOCUMENT_PULL_NOTICE = "Não foi possível atualizar o artefato. Tente novamente."
const val DELETE_FAILED_MESSAGE = "Não foi possível excluir a nota. Tente novamente."

/** A confirmação de excluir: aberta, em andamento e o erro da última tentativa. */
data class DocumentDeleteDialog(
    val open: Boolean = false,
    val running: Boolean = false,
    val error: String? = null,
)

sealed interface DocumentDetailUiState {
    data object Loading : DocumentDetailUiState

    /** O artefato não existe ou é de outro usuário (404 e 403 não se distinguem na tela). */
    data object Missing : DocumentDetailUiState

    data object Error : DocumentDetailUiState

    /** [now] é o instante da leitura: os "hoje, 09:00" saem dele. */
    data class Ready(
        val artifact: Artifact,
        val now: Instant,
        val delete: DocumentDeleteDialog = DocumentDeleteDialog(),
        /** O artefato foi excluído: a tela volta para a lista. */
        val deleted: Boolean = false,
        /** Um puxar para recarregar está em curso: o indicador gira; as releituras automáticas não acendem isto. */
        val refreshing: Boolean = false,
        /** O aviso do puxar que falhou, com o artefato mantido; só o puxar o acende e o apaga (as releituras o preservam). */
        val pullNotice: String? = null,
    ) : DocumentDetailUiState {
        /** Um alimento que o agente ainda calcula: a tela o relê até terminar. */
        val pendingMeal: Boolean =
            artifact.type == ArtifactType.Food && (artifact.data as? FoodData)?.generation == FoodGeneration.Pending

        /** Sem tarefa, ou num artefato global, a seção "Tarefas" some. */
        val showsTasks: Boolean get() = !artifact.global && artifact.tasks.isNotEmpty()

        /**
         * O tipo que a barra de edição por IA manda, ou `null` sem barra: skill e agente têm a barra do próprio arquivo
         * (`AgentFileSection`), e o catálogo global, o roteador e o exercício não se editam pelo app.
         */
        val editType: EditEntityType? =
            if (artifact.type == ArtifactType.Skill || artifact.type == ArtifactType.Agent) {
                null
            } else {
                editEntityTypeOfArtifact(artifact.type, artifact.global)
            }

        /** Editar e excluir valem só para a nota de texto própria. */
        val canEdit: Boolean get() = artifact.type.isFreeText && !artifact.global
    }
}

@HiltViewModel
class DocumentDetailViewModel
    @Inject
    constructor(
        savedState: SavedStateHandle,
        private val artifacts: ArtifactRepository,
        private val clock: AppClock,
    ) : ViewModel() {
        private val documentId: String = checkNotNull(savedState["documentId"]) { "A rota do artefato leva o documentId." }
        private val mutableState = MutableStateFlow<DocumentDetailUiState>(DocumentDetailUiState.Loading)
        val state: StateFlow<DocumentDetailUiState> = mutableState.asStateFlow()

        private var visible = false
        private val polling = PollingLoop(viewModelScope, MEAL_POLL_MS)

        init {
            load()
        }

        fun retry() {
            mutableState.value = DocumentDetailUiState.Loading
            load()
        }

        /** Relê o artefato sem trocar a tela por "Carregando": depois de uma edição por IA ela mostra a versão nova. Falha mantém a que está. */
        fun refresh() {
            if (mutableState.value !is DocumentDetailUiState.Ready) return
            viewModelScope.launch { reread() }
        }

        /**
         * O puxar para recarregar: a mesma releitura silenciosa de [refresh], com o indicador girando até ela acabar.
         * "Não existe mais" (404 e 403) vai para "Artefato não encontrado."; qualquer outra falha mantém o artefato e
         * acende [Ready.pullNotice]. Não faz nada com outro puxar em curso nem fora do artefato lido.
         */
        fun pull() {
            val ready = mutableState.value as? DocumentDetailUiState.Ready ?: return
            if (ready.refreshing) return
            updateReady { it.copy(refreshing = true) }
            viewModelScope.launch {
                try {
                    when (reread()) {
                        null -> updateReady { it.copy(pullNotice = null) }
                        is ArtifactNotFoundException -> mutableState.value = DocumentDetailUiState.Missing
                        else -> updateReady { it.copy(pullNotice = FAILED_DOCUMENT_PULL_NOTICE) }
                    }
                } finally {
                    updateReady { it.copy(refreshing = false) }
                }
            }
        }

        /** Lê o artefato e o põe na tela, mantendo o aviso do puxar; devolve a falha, ou `null`. A tela fica como está se falhar. */
        private suspend fun reread(): Exception? {
            val failure =
                try {
                    mutableState.value = readyOf(artifacts.get(documentId))
                    null
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    // A falha de transporte mantém o artefato visível.
                    failure
                }
            syncPolling()
            return failure
        }

        private fun readyOf(artifact: Artifact) =
            DocumentDetailUiState.Ready(
                artifact,
                clock.now(),
                pullNotice = (mutableState.value as? DocumentDetailUiState.Ready)?.pullNotice,
            )

        /** A tela está à vista (resumida) ou não: a releitura do alimento em cálculo só anda com ela à vista. */
        fun setVisible(value: Boolean) {
            visible = value
            syncPolling()
        }

        private fun load() {
            viewModelScope.launch {
                try {
                    mutableState.value = DocumentDetailUiState.Ready(artifacts.get(documentId), clock.now())
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (missing: ArtifactNotFoundException) {
                    mutableState.value = DocumentDetailUiState.Missing
                } catch (failure: Exception) {
                    mutableState.value = DocumentDetailUiState.Error
                }
                syncPolling()
            }
        }

        fun askDelete() = updateReady { it.copy(delete = DocumentDeleteDialog(open = true)) }

        fun dismissDelete() = updateReady { if (it.delete.running) it else it.copy(delete = DocumentDeleteDialog()) }

        /** Confirma a exclusão: `DELETE /api/artifacts/{id}`; ao terminar, a tela volta para a lista. */
        fun confirmDelete() {
            val ready = mutableState.value as? DocumentDetailUiState.Ready ?: return
            if (!ready.canEdit || ready.delete.running) return
            updateReady { it.copy(delete = it.delete.copy(running = true, error = null)) }
            viewModelScope.launch {
                try {
                    artifacts.delete(documentId)
                    updateReady { it.copy(delete = DocumentDeleteDialog(), deleted = true) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    updateReady { it.copy(delete = it.delete.copy(running = false, error = DELETE_FAILED_MESSAGE)) }
                }
            }
        }

        private fun updateReady(transform: (DocumentDetailUiState.Ready) -> DocumentDetailUiState.Ready) =
            mutableState.update { (it as? DocumentDetailUiState.Ready)?.let(transform) ?: it }

        private fun pending(): Boolean = (mutableState.value as? DocumentDetailUiState.Ready)?.pendingMeal == true

        /**
         * Com o alimento em cálculo e a tela à vista, relê o artefato a cada [MEAL_POLL_MS] até o servidor terminar;
         * uma leitura que falha mantém a nota que está na tela. Sai de vista ou termina, para.
         */
        private fun syncPolling() {
            polling.sync(active = { visible && pending() }) {
                try {
                    mutableState.value = readyOf(artifacts.get(documentId))
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    // A falha de transporte mantém a nota visível.
                }
            }
        }
    }
