package app.braid.mobile.ui.hub

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.braid.mobile.ui.event.SelectField
import app.braid.mobile.ui.event.SelectOption
import app.braid.mobile.ui.event.TagInput
import app.braid.mobile.ui.event.TagSuggestionViewModel
import app.braid.mobile.ui.notes.NoteDraft

private val taskStatusOptions =
    listOf(
        SelectOption("todo", "A fazer"),
        SelectOption("scheduled", "Agendada"),
        SelectOption("toDefine", "A definir"),
        SelectOption("inHold", "Em espera"),
        SelectOption("done", "Concluída"),
        SelectOption("cancel", "Cancelada"),
    )

private val taskPriorityOptions =
    listOf(
        SelectOption("urgent", "Urgente"),
        SelectOption("high", "Alta"),
        SelectOption("medium", "Média"),
        SelectOption("low", "Baixa"),
    )

/** “Criar → Tarefa”: nome, status, prioridade e detalhes, com os campos do `entityForm` do web. */
@Composable
@Suppress("ktlint:standard:function-naming")
fun TaskCreateForm(
    state: HubCreateState,
    onSubmit: (TaskDraft) -> Unit,
    onEdited: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var draft by rememberSaveable(stateSaver = TaskDraftSaver) { mutableStateOf(TaskDraft()) }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        HubTextBox(
            value = draft.name,
            onValueChange = {
                draft = draft.copy(name = it)
                onEdited()
            },
            label = "Nome da tarefa",
            placeholder = "Nome da tarefa",
            enabled = !state.saving,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SelectField(
                modifier = Modifier.weight(1f),
                label = "Status",
                options = taskStatusOptions,
                selected = draft.status,
                onSelect = { draft = draft.copy(status = it) },
                enabled = !state.saving,
            )
            SelectField(
                modifier = Modifier.weight(1f),
                label = "Prioridade",
                options = taskPriorityOptions,
                selected = draft.priority,
                onSelect = { draft = draft.copy(priority = it) },
                enabled = !state.saving,
            )
        }
        HubTextBox(
            value = draft.details,
            onValueChange = { draft = draft.copy(details = it) },
            label = "Detalhes",
            placeholder = "Acrescente o que for importante…",
            singleLine = false,
            minLines = 2,
            maxLines = 6,
            enabled = !state.saving,
        )
        CreateFooter(error = state.error, saving = state.saving, label = "Criar tarefa") { onSubmit(draft) }
    }
}

/** “Criar → Nota”: título opcional, texto e tags. */
@Composable
@Suppress("ktlint:standard:function-naming")
fun NoteCreateForm(
    state: HubCreateState,
    onSubmit: (NoteDraft) -> Unit,
    onEdited: () -> Unit,
    modifier: Modifier = Modifier,
    tagViewModel: TagSuggestionViewModel = hiltViewModel(),
) {
    var name by rememberSaveable { mutableStateOf("") }
    var content by rememberSaveable { mutableStateOf("") }
    var tags by rememberSaveable { mutableStateOf(emptyList<String>()) }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        HubTextBox(
            value = name,
            onValueChange = { name = it },
            label = "Título",
            placeholder = "Opcional — vem da primeira linha",
            enabled = !state.saving,
        )
        HubTextBox(
            value = content,
            onValueChange = {
                content = it
                onEdited()
            },
            label = "Conteúdo da nota",
            placeholder = "Suas anotações, em markdown…",
            singleLine = false,
            minLines = 5,
            maxLines = 10,
            enabled = !state.saving,
        )
        TagInput(tags = tags, onTagsChange = { tags = it }, viewModel = tagViewModel)
        CreateFooter(error = state.error, saving = state.saving, label = "Salvar nota") {
            onSubmit(NoteDraft(name = name, content = content, tags = tags))
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun CreateFooter(
    error: String?,
    saving: Boolean,
    label: String,
    onClick: () -> Unit,
) {
    if (error != null) {
        Text(text = error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
    Button(modifier = Modifier.fillMaxWidth(), onClick = onClick, enabled = !saving) {
        Text(if (saving) "Salvando…" else label)
    }
}
