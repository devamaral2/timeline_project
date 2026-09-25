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
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
@Suppress("ktlint:standard:function-naming")
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun CreateEventScreen(
    onBack: () -> Unit,
    onCreated: (String) -> Unit,
    viewModel: CreateEventViewModel = hiltViewModel(),
    tagViewModel: TagSuggestionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf(NewEventDraft()) }

    LaunchedEffect(state) {
        if (state is CreateEventUiState.Success) {
            onCreated((state as CreateEventUiState.Success).eventId)
            viewModel.reset()
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Novo evento") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Voltar para a agenda")
                    }
                },
            )
        },
    ) { paddingValues ->
        NewEventContent(
            draft = draft,
            state = state,
            modifier = Modifier.padding(paddingValues),
            onDraftChange = { draft = it },
            onSubmit = { viewModel.submit(draft) },
            onBack = onBack,
            tagViewModel = tagViewModel,
        )
    }
}

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
) {
    val submitting = state is CreateEventUiState.Submitting
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(text = "Tipo", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NewEventType.entries.forEach { type ->
                FilterChip(
                    selected = draft.type == type,
                    onClick = { onDraftChange(draft.copy(type = type)) },
                    label = { Text(type.label) },
                )
            }
        }

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

        Text(text = "Lembretes", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(0.0, 5.0, 15.0, 60.0).forEach { minutes ->
                val label = if (minutes == 0.0) "Sem aviso" else "$minutes min"
                FilterChip(
                    selected =
                        (minutes == 0.0 && draft.notifyOffsetsMinutes.isEmpty()) ||
                            (minutes > 0 && minutes in draft.notifyOffsetsMinutes),
                    onClick = {
                        onDraftChange(
                            draft.copy(
                                notifyOffsetsMinutes = if (minutes == 0.0) emptyList() else listOf(minutes),
                            ),
                        )
                    },
                    label = { Text(label) },
                )
            }
        }

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
