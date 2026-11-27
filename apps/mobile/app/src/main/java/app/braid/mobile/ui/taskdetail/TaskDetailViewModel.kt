package app.braid.mobile.ui.taskdetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskDetail
import app.braid.mobile.domain.task.TaskDetailRepository
import app.braid.mobile.domain.task.TaskNotFoundException
import app.braid.mobile.domain.task.TaskPriority
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.artifactLinkInputs
import app.braid.mobile.domain.task.draftArtifactsFromTask
import app.braid.mobile.domain.task.draftWithPickedArtifact
import app.braid.mobile.domain.task.statusPatch
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.ui.taskartifacts.TaskArtifactPicker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

const val STALE_TASK_NOTICE = "Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira e tente de novo."
const val FAILED_STATUS_NOTICE = "Não foi possível trocar o status. Tente novamente."
const val FAILED_PRIORITY_NOTICE = "Não foi possível trocar a prioridade. Tente novamente."
const val FAILED_ARTIFACT_NOTICE = "Não foi possível ligar o artefato. Tente novamente."
const val GONE_TASK_NOTICE = "Esta tarefa já não existe. Ela foi apagada em outro lugar."
const val FAILED_DELETE_NOTICE = "Não foi possível excluir a tarefa. Tente novamente."

/**
 * As tarefas ligadas a esta (a principal ou as subtarefas), lidas uma a uma pelo id: [cards] é `null` enquanto carrega;
 * a que não carregou (apagada, de outro dono) some da lista e acende [failed].
 */
data class LinkedTasks(
    val cards: List<TaskCard>? = null,
    val failed: Boolean = false,
)

/** O diálogo de excluir: aberto, excluindo, "já não existe" (só sobra "Voltar") ou com o erro de outra falha. */
data class DeleteDialog(
    val open: Boolean = false,
    val running: Boolean = false,
    val gone: Boolean = false,
    val error: String? = null,
)

sealed interface TaskDetailUiState {
    data object Loading : TaskDetailUiState

    /** 404 e 403: "Tarefa não encontrada." */
    data object Missing : TaskDetailUiState

    data object Failed : TaskDetailUiState

    data class Content(
        val task: TaskDetail,
        /** O instante da leitura: os textos calculados das linhas ligadas ("Hoje", "há 12 min") saem dele. */
        val now: Instant,
        /** Uma troca está em voo: enquanto isso o status e a prioridade não aceitam outra. */
        val saving: Boolean = false,
        val notice: String? = null,
        /** `null` quando a tarefa não tem principal: a seção não aparece. */
        val parent: LinkedTasks? = null,
        /** `null` quando a tarefa não tem subtarefas. */
        val subtasks: LinkedTasks? = null,
        val delete: DeleteDialog = DeleteDialog(),
        /** A tarefa foi excluída: a tela volta à anterior. */
        val deleted: Boolean = false,
    ) : TaskDetailUiState
}

/** O detalhe de uma tarefa: lê `GET /api/tasks/{id}`, troca status e prioridade com a revisão lida e exclui. */
@HiltViewModel
class TaskDetailViewModel
    @Inject
    constructor(
        savedState: SavedStateHandle,
        private val tasks: TaskDetailRepository,
        private val clock: AppClock,
        artifacts: ArtifactRepository,
    ) : ViewModel() {
        private val taskId: String = checkNotNull(savedState["taskId"]) { "O detalhe abre com o id da tarefa" }
        private val mutableState = MutableStateFlow<TaskDetailUiState>(TaskDetailUiState.Loading)
        val state: StateFlow<TaskDetailUiState> = mutableState.asStateFlow()
        private var linkedJob: Job? = null

        /** O seletor do "+" da seção Artefatos: a escolha liga o artefato e grava na hora. */
        val artifactPicker = TaskArtifactPicker(viewModelScope, artifacts)

        init {
            load()
        }

        fun retry() = load()

        /** Relê a tarefa sem trocar a tela por "Carregando": ao voltar da edição o detalhe mostra a versão nova. */
        fun reload() {
            if (mutableState.value !is TaskDetailUiState.Content) return
            viewModelScope.launch {
                if (readTask()) loadLinked()
            }
        }

        private fun load() {
            mutableState.value = TaskDetailUiState.Loading
            viewModelScope.launch {
                if (readTask()) loadLinked()
            }
        }

        /** Lê a tarefa e a põe na tela, mantendo o que já estava (troca em voo, aviso, diálogo). Falha de leitura vira a tela de erro. */
        private suspend fun readTask(): Boolean =
            try {
                val task = tasks.task(taskId)
                val readAt = clock.now()
                mutableState.update { current ->
                    if (current is TaskDetailUiState.Content) {
                        current.copy(task = task, now = readAt)
                    } else {
                        TaskDetailUiState.Content(task = task, now = readAt)
                    }
                }
                true
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (missing: TaskNotFoundException) {
                mutableState.value = TaskDetailUiState.Missing
                false
            } catch (failure: Exception) {
                mutableState.value = TaskDetailUiState.Failed
                false
            }

        /** Tarefa principal e subtarefas: uma leitura por id; as seções só existem quando há ids. */
        private fun loadLinked() {
            val content = mutableState.value as? TaskDetailUiState.Content ?: return
            // A tarefa de agente tem o próprio detalhe (`AgentTaskViewModel`), que lê a hierarquia dela.
            if (content.task.actor == TaskActor.Agent) return
            val parentIds = listOfNotNull(content.task.parentTaskId)
            val subtaskIds = content.task.subtaskIds
            val wantsParent = parentIds.isNotEmpty()
            val wantsSubtasks = subtaskIds.isNotEmpty()
            mutableState.update {
                (it as? TaskDetailUiState.Content)?.copy(
                    parent = if (wantsParent) (it.parent ?: LinkedTasks()) else null,
                    subtasks = if (wantsSubtasks) (it.subtasks ?: LinkedTasks()) else null,
                ) ?: it
            }
            linkedJob?.cancel()
            linkedJob =
                viewModelScope.launch {
                    val parent = if (wantsParent) tasks.readLinked(parentIds) else null
                    val subtasks = if (wantsSubtasks) tasks.readLinked(subtaskIds) else null
                    mutableState.update {
                        (it as? TaskDetailUiState.Content)?.copy(parent = parent, subtasks = subtasks) ?: it
                    }
                }
        }

        /** Troca o status com a revisão lida; escolher o que já está não grava nada. */
        fun changeStatus(status: TaskStatus) {
            val content = mutableState.value as? TaskDetailUiState.Content ?: return
            if (!content.task.hasHumanControls || status == content.task.status) return
            change(FAILED_STATUS_NOTICE) { task -> tasks.changeStatus(task.id, statusPatch(task.card, status, clock.now())) }
        }

        /** Troca a prioridade com a revisão lida; escolher a que já está não grava nada. */
        fun changePriority(priority: TaskPriority) {
            val content = mutableState.value as? TaskDetailUiState.Content ?: return
            if (!content.task.hasHumanControls || priority == content.task.priority) return
            change(FAILED_PRIORITY_NOTICE) { task -> tasks.changePriority(task.id, task.card.revision, priority) }
        }

        /** O "+" da seção Artefatos: abre o seletor da fonte do tipo da tarefa. */
        fun openArtifactPicker() {
            val task = (mutableState.value as? TaskDetailUiState.Content)?.task ?: return
            artifactPicker.open(task.card.kind, task.artifacts.map { it.artifact.id }, ::linkArtifact)
        }

        /**
         * O artefato escolhido entra no fim da lista e a lista inteira vai com a revisão lida; na refeição o alimento
         * entra como cópia nova, sem quantidade.
         */
        private fun linkArtifact(artifact: Artifact) {
            change(FAILED_ARTIFACT_NOTICE) { task ->
                val next =
                    draftWithPickedArtifact(draftArtifactsFromTask(task.artifacts), task.card.kind, artifact, UUID.randomUUID().toString())
                tasks.changeArtifacts(task.id, task.card.revision, artifactLinkInputs(next))
            }
        }

        /** Manda a troca com a revisão lida. Revisão velha: relê a tarefa e avisa, sem gravar nada. Uma troca por vez. */
        private fun change(
            failure: String,
            call: suspend (TaskDetail) -> Unit,
        ) {
            val content = mutableState.value as? TaskDetailUiState.Content ?: return
            if (content.saving) return
            mutableState.update { (it as TaskDetailUiState.Content).copy(saving = true, notice = null) }
            viewModelScope.launch {
                try {
                    call(content.task)
                    if (readTask()) loadLinkedIfChanged(content.task)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (stale: StaleRevisionException) {
                    if (readTask()) mutableState.update { (it as? TaskDetailUiState.Content)?.copy(notice = STALE_TASK_NOTICE) ?: it }
                } catch (other: Exception) {
                    mutableState.update { (it as? TaskDetailUiState.Content)?.copy(notice = failure) ?: it }
                } finally {
                    mutableState.update { (it as? TaskDetailUiState.Content)?.copy(saving = false) ?: it }
                }
            }
        }

        private fun loadLinkedIfChanged(before: TaskDetail) {
            val after = (mutableState.value as? TaskDetailUiState.Content)?.task ?: return
            if (after.parentTaskId != before.parentTaskId || after.subtaskIds != before.subtaskIds) loadLinked()
        }

        fun askDelete() = updateDelete { DeleteDialog(open = true) }

        fun dismissDelete() = updateDelete { if (it.running) it else DeleteDialog() }

        /** Exclui a tarefa; sucesso volta à tela anterior, "já não existe" deixa só "Voltar" e outra falha avisa. */
        fun confirmDelete() {
            val content = mutableState.value as? TaskDetailUiState.Content ?: return
            if (content.delete.running) return
            updateDelete { it.copy(running = true, error = null) }
            viewModelScope.launch {
                try {
                    tasks.delete(content.task.id)
                    mutableState.update { (it as? TaskDetailUiState.Content)?.copy(delete = DeleteDialog(), deleted = true) ?: it }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (missing: TaskNotFoundException) {
                    updateDelete { it.copy(running = false, gone = true, error = GONE_TASK_NOTICE) }
                } catch (failure: Exception) {
                    updateDelete { it.copy(running = false, error = FAILED_DELETE_NOTICE) }
                }
            }
        }

        private fun updateDelete(transform: (DeleteDialog) -> DeleteDialog) =
            mutableState.update { (it as? TaskDetailUiState.Content)?.copy(delete = transform(it.delete)) ?: it }
    }
