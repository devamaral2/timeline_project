package app.braid.mobile.ui.event

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
@Suppress("ktlint:standard:function-naming")
fun NewEventContent(
    draft: NewEventDraft,
    state: CreateEventUiState,
    modifier: Modifier = Modifier,
    onDraftChange: (NewEventDraft) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    tagViewModel: TagSuggestionViewModel? = null,
    contentPadding: Dp = 20.dp,
) {
    val submitting = state is CreateEventUiState.Submitting
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        SelectField(
            label = "Tipo",
            sheetTitle = "Tipo de evento",
            options = NewEventType.entries.map { SelectOption(it, it.label, it.icon) },
            selected = draft.type,
            onSelect = { onDraftChange(draft.copy(type = it)) },
            enabled = !submitting,
        )

        TextField(
            modifier = Modifier.fillMaxWidth(),
            value = draft.name,
            onValueChange = { onDraftChange(draft.copy(name = it)) },
            label = { Text("Nome") },
            placeholder = { Text("Ex.: Estudar inglês") },
            singleLine = true,
            enabled = !submitting,
        )
        tagViewModel?.let { tagInputViewModel ->
            TagInput(
                tags = draft.tags,
                onTagsChange = { onDraftChange(draft.copy(tags = it)) },
                viewModel = tagInputViewModel,
            )
        }
        TextField(
            modifier = Modifier.fillMaxWidth(),
            value = draft.description,
            onValueChange = { onDraftChange(draft.copy(description = it)) },
            label = { Text("Descrição") },
            minLines = 2,
            enabled = !submitting,
        )
        TextField(
            modifier = Modifier.fillMaxWidth(),
            value = draft.startedAtLocal,
            onValueChange = { onDraftChange(draft.copy(startedAtLocal = it)) },
            label = { Text("Início (AAAA-MM-DDTHH:MM)") },
            placeholder = { Text("Vazio = agora") },
            singleLine = true,
            enabled = !submitting,
        )
        TextField(
            modifier = Modifier.fillMaxWidth(),
            value = draft.finishedAtLocal,
            onValueChange = { onDraftChange(draft.copy(finishedAtLocal = it)) },
            label = { Text("Fim (opcional)") },
            placeholder = { Text("Vazio = em andamento") },
            singleLine = true,
            enabled = !submitting,
        )

        when (draft.type) {
            NewEventType.Meal ->
                TextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = draft.mealText,
                    onValueChange = { onDraftChange(draft.copy(mealText = it)) },
                    label = { Text("Refeição e preparo") },
                    minLines = 2,
                    enabled = !submitting,
                )
            NewEventType.Sleep -> {
                TextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = draft.sleepTrackedMinutes,
                    onValueChange = { onDraftChange(draft.copy(sleepTrackedMinutes = it)) },
                    label = { Text("Tempo monitorado (minutos)") },
                    singleLine = true,
                    enabled = !submitting,
                )
                TextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = draft.sleepScore,
                    onValueChange = { onDraftChange(draft.copy(sleepScore = it)) },
                    label = { Text("Pontuação") },
                    singleLine = true,
                    enabled = !submitting,
                )
            }
            NewEventType.Routine, NewEventType.Training -> Unit
        }

        SelectField(
            label = "Lembrete",
            options = reminderOptions,
            selected = draft.notifyOffsetsMinutes.selectedReminder(),
            onSelect = { minutes ->
                onDraftChange(draft.copy(notifyOffsetsMinutes = if (minutes == 0.0) emptyList() else listOf(minutes)))
            },
            enabled = !submitting,
        )

        if (state is CreateEventUiState.Error) {
            Text(text = state.message, color = MaterialTheme.colorScheme.error)
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(modifier = Modifier.weight(1f), onClick = onBack, enabled = !submitting) {
                Text("Cancelar")
            }
            Button(modifier = Modifier.weight(1f), onClick = onSubmit, enabled = !submitting) {
                Text(if (submitting) "Criando…" else "Criar evento")
            }
        }
    }
}

/** O mesmo ícone por tipo que o cartão da agenda usa (`visualFor` em `EventCard.kt`). */
private val NewEventType.icon: ImageVector
    get() =
        when (this) {
            NewEventType.Routine -> Icons.Outlined.AccessTime
            NewEventType.Meal -> Icons.Outlined.Restaurant
            NewEventType.Sleep -> Icons.Outlined.Bedtime
            NewEventType.Training -> Icons.Outlined.FitnessCenter
        }
