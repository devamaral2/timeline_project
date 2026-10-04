package app.braid.mobile.ui.hub

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.CreateNoteInputDto
import app.braid.mobile.data.dto.CreateTaskInputDto
import app.braid.mobile.data.notes.NoteGateway
import app.braid.mobile.data.notes.NoteResult
import app.braid.mobile.data.tasks.TaskGateway
import app.braid.mobile.data.tasks.TaskResult
import app.braid.mobile.ui.notes.NoteDraft
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** O que a aba “Criar” do hub preenche para uma tarefa. */
data class TaskDraft(
    val name: String = "",
    val details: String = "",
    val status: String = "todo",
    val priority: String = "medium",
)

data class HubCreateState(
    val saving: Boolean = false,
    val error: String? = null,
)

sealed interface HubCreateEffect {
    data object TaskCreated : HubCreateEffect

    data class NoteCreated(
        val noteId: String,
    ) : HubCreateEffect
}

/** Cria tarefas e notas pela aba “Criar” (o evento tem o `CreateEventViewModel`, que já existe). */
@HiltViewModel
class HubCreateViewModel
    @Inject
    constructor(
        private val tasks: TaskGateway,
        private val notes: NoteGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(HubCreateState())
        private val mutableEffects = Channel<HubCreateEffect>(Channel.BUFFERED)

        val state: StateFlow<HubCreateState> = mutableState.asStateFlow()
        val effects = mutableEffects.receiveAsFlow()

        fun clearError() = mutableState.update { it.copy(error = null) }

        fun createTask(draft: TaskDraft) {
            if (mutableState.value.saving) return
            if (draft.name.isBlank()) {
                mutableState.update { it.copy(error = "Dê um nome para a tarefa.") }
                return
            }
            mutableState.update { HubCreateState(saving = true) }
            viewModelScope.launch {
                val input =
                    CreateTaskInputDto(
                        name = draft.name.trim(),
                        description = draft.details.trim().ifEmpty { null },
                        status = draft.status,
                        priority = draft.priority,
                    )
                when (tasks.create(input)) {
                    is TaskResult.Success -> {
                        mutableState.update { HubCreateState() }
                        mutableEffects.send(HubCreateEffect.TaskCreated)
                    }
                    is TaskResult.Failure ->
                        mutableState.update { HubCreateState(error = "Não foi possível criar a tarefa. Tente novamente.") }
                }
            }
        }

        fun createNote(draft: NoteDraft) {
            if (mutableState.value.saving) return
            if (draft.isBlank) {
                mutableState.update { it.copy(error = "Escreva o texto da nota.") }
                return
            }
            mutableState.update { HubCreateState(saving = true) }
            viewModelScope.launch {
                val input =
                    CreateNoteInputDto.text(
                        content = draft.content,
                        name = draft.name.trim().ifEmpty { null },
                        tags = draft.tags,
                    )
                when (val result = notes.create(input)) {
                    is NoteResult.Success -> {
                        mutableState.update { HubCreateState() }
                        mutableEffects.send(HubCreateEffect.NoteCreated(result.value.noteId))
                    }
                    is NoteResult.Failure ->
                        mutableState.update { HubCreateState(error = "Não foi possível salvar a nota. Tente novamente.") }
                }
            }
        }
    }
