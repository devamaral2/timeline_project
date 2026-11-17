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
import app.braid.mobile.domain.time.AppClock
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

/** De quanto em quanto tempo um alimento em cálculo é relido. */
const val MEAL_POLL_MS = 1_500L

sealed interface DocumentDetailUiState {
    data object Loading : DocumentDetailUiState

    /** O documento não existe ou é de outro usuário (404 e 403 não se distinguem na tela). */
    data object Missing : DocumentDetailUiState

    data object Error : DocumentDetailUiState

    /** [now] é o instante da leitura: os "hoje, 09:00" saem dele. */
    data class Ready(
        val artifact: Artifact,
        val now: Instant,
    ) : DocumentDetailUiState {
        /** Um alimento que o agente ainda calcula: a tela o relê até terminar. */
        val pendingMeal: Boolean =
            artifact.type == ArtifactType.Food && (artifact.data as? FoodData)?.generation == FoodGeneration.Pending

        /** Sem tarefa, ou num documento global, a seção "Tarefas" some. */
        val showsTasks: Boolean get() = !artifact.global && artifact.tasks.isNotEmpty()

        /** Editar e excluir valem só para a nota de texto própria (o ticket 17 acende as ações). */
        val canEdit: Boolean get() = artifact.type == ArtifactType.Text && !artifact.global
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
        private val documentId: String = checkNotNull(savedState["documentId"]) { "A rota do documento leva o documentId." }
        private val mutableState = MutableStateFlow<DocumentDetailUiState>(DocumentDetailUiState.Loading)
        val state: StateFlow<DocumentDetailUiState> = mutableState.asStateFlow()

        private var visible = false
        private var pollJob: Job? = null

        init {
            load()
        }

        fun retry() {
            mutableState.value = DocumentDetailUiState.Loading
            load()
        }

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

        private fun pending(): Boolean = (mutableState.value as? DocumentDetailUiState.Ready)?.pendingMeal == true

        /**
         * Com o alimento em cálculo e a tela à vista, relê o documento a cada [MEAL_POLL_MS] até o servidor terminar;
         * uma leitura que falha mantém a nota que está na tela. Sai de vista ou termina, para.
         */
        private fun syncPolling() {
            if (!visible || !pending()) {
                pollJob?.cancel()
                pollJob = null
                return
            }
            if (pollJob?.isActive == true) return
            pollJob =
                viewModelScope.launch {
                    while (visible && pending()) {
                        delay(MEAL_POLL_MS)
                        try {
                            mutableState.value = DocumentDetailUiState.Ready(artifacts.get(documentId), clock.now())
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (failure: Exception) {
                            // A falha de transporte mantém a nota visível.
                        }
                    }
                    pollJob = null
                }
        }
    }
