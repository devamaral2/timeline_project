@file:Suppress("ktlint:standard:function-naming")

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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.MealEventNoteDto
import app.braid.mobile.data.dto.UpdateEventInputDto
import app.braid.mobile.data.dto.UpdateEventNoteDto
import app.braid.mobile.domain.events.noteTypeForEventKind
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun EditEventScreen(
    eventId: String,
    onBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: EditEventViewModel = hiltViewModel(),
    tagViewModel: TagSuggestionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val linkableNotes by viewModel.linkableNotes.collectAsStateWithLifecycle()
    LaunchedEffect(eventId) { viewModel.load(eventId) }
    LaunchedEffect(state) {
        if (state is EditEventUiState.Saved) onSaved()
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Editar evento") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Voltar")
                    }
                },
            )
        },
    ) { paddingValues ->
        when (val current = state) {
            EditEventUiState.Loading, EditEventUiState.Saving ->
                Column(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        modifier = Modifier.fillMaxWidth(),
                        text = if (state is EditEventUiState.Saving) "Salvando…" else "Carregando…",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            EditEventUiState.Error -> {
                EditMessage(
                    Modifier.padding(paddingValues),
                    "Não foi possível carregar o evento.",
                ) {
                    viewModel.load(eventId)
                }
            }
            is EditEventUiState.SaveError -> {
                EditMessage(
                    Modifier.padding(paddingValues),
                    current.message,
                ) {
                    viewModel.load(eventId)
                }
            }
            EditEventUiState.Saved -> Unit
            is EditEventUiState.Content -> {
                val event = current.event
                if (event.notes.any { it is MealEventNoteDto && it.data.generation?.status == "pending" }) {
                    Column(modifier = Modifier.padding(paddingValues).padding(20.dp)) {
                        Text("Gerando informações da refeição. Aguarde para editar.")
                        TextButton(onClick = onBack) { Text("Voltar") }
                    }
                } else {
                    EditEventContent(
                        event = event,
                        linkableNotes = linkableNotes,
                        modifier = Modifier.padding(paddingValues),
                        tagViewModel = tagViewModel,
                        onCancel = onBack,
                        onSave = viewModel::save,
                    )
                }
            }
        }
    }
}

/**
 * A edição manual de qualquer evento: os campos dele e a associação de notas que
 * já existem. O conteúdo das notas não se edita aqui.
 */
@Composable
private fun EditEventContent(
    event: EventDetailDto,
    linkableNotes: LinkableNotesUiState,
    modifier: Modifier,
    tagViewModel: TagSuggestionViewModel,
    onCancel: () -> Unit,
    onSave: (UpdateEventInputDto) -> Unit,
) {
    var name by remember(event.id) { mutableStateOf(event.name) }
    var description by remember(event.id) { mutableStateOf(event.description) }
    var tags by remember(event.id) { mutableStateOf(event.tags) }
    var startedAt by remember(event.id) { mutableStateOf(localValueOf(event.startedAt)) }
    var finishedAt by remember(event.id) { mutableStateOf(event.finishedAt?.let(::localValueOf) ?: "") }
    var missed by remember(event.id) { mutableStateOf(event.missed) }
    var priority by remember(event.id) { mutableStateOf(event.priority) }
    var notifyOffsetsMinutes by remember(event.id) { mutableStateOf(event.notifyOffsetsMinutes) }
    var linkedNoteIds by remember(event.id) { mutableStateOf(emptyList<String>()) }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        EditCommonFields(
            name = name,
            onNameChange = { name = it },
            description = description,
            onDescriptionChange = { description = it },
            tags = tags,
            onTagsChange = { tags = it },
            startedAt = startedAt,
            onStartedAtChange = { startedAt = it },
            finishedAt = finishedAt,
            onFinishedAtChange = { finishedAt = it },
            missed = missed,
            onMissedChange = { missed = it },
            priority = priority,
            onPriorityChange = { priority = it },
            notifyOffsetsMinutes = notifyOffsetsMinutes,
            onNotifyOffsetsChange = { notifyOffsetsMinutes = it },
            tagViewModel = tagViewModel,
        )
        LinkNotesSection(
            noteType = noteTypeForEventKind(event.kind),
            state = linkableNotes,
            selectedIds = linkedNoteIds,
            onToggle = { noteId, checked ->
                linkedNoteIds = if (checked) linkedNoteIds + noteId else linkedNoteIds - noteId
            },
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(modifier = Modifier.weight(1f), onClick = onCancel) {
                Text("Cancelar")
            }
            Button(
                modifier = Modifier.weight(1f),
                onClick = {
                    onSave(
                        updateInput(
                            event = event,
                            name = name,
                            description = description,
                            tags = tags,
                            startedAt = startedAt,
                            finishedAt = finishedAt,
                            missed = missed,
                            priority = priority,
                            notifyOffsetsMinutes = notifyOffsetsMinutes,
                            // A lista inteira vai só com os ids: as atuais ficam como estão e as escolhidas entram.
                            notes =
                                linkedNoteIds
                                    .takeIf { it.isNotEmpty() }
                                    ?.let { ids -> (event.notes.map { it.id } + ids).map { UpdateEventNoteDto(id = it) } },
                        ),
                    )
                },
            ) {
                Text("Salvar alterações")
            }
        }
    }
}

@Composable
private fun LinkNotesSection(
    noteType: String,
    state: LinkableNotesUiState,
    selectedIds: List<String>,
    onToggle: (String, Boolean) -> Unit,
) {
    val label = noteTypeLabel(noteType)
    Text("Associar nota de $label", style = MaterialTheme.typography.labelLarge)
    when (state) {
        LinkableNotesUiState.Loading ->
            Text("Carregando notas…", color = MaterialTheme.colorScheme.onSurfaceVariant)
        LinkableNotesUiState.Failed ->
            Text("Não foi possível carregar as notas.", color = MaterialTheme.colorScheme.error)
        is LinkableNotesUiState.Loaded ->
            if (state.notes.isEmpty()) {
                Text(
                    "Nenhuma nota de $label disponível para associar.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                state.notes.forEach { note ->
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = note.id in selectedIds,
                            onCheckedChange = { checked -> onToggle(note.id, checked) },
                        )
                        Text(note.name)
                    }
                }
            }
    }
}

private fun noteTypeLabel(noteType: String): String =
    when (noteType) {
        "meal" -> "refeição"
        "sleep" -> "sono"
        "training" -> "treino"
        else -> "texto"
    }

@Composable
private fun EditCommonFields(
    name: String,
    onNameChange: (String) -> Unit,
    description: String,
    onDescriptionChange: (String) -> Unit,
    tags: List<String>,
    onTagsChange: (List<String>) -> Unit,
    startedAt: String,
    onStartedAtChange: (String) -> Unit,
    finishedAt: String,
    onFinishedAtChange: (String) -> Unit,
    missed: Boolean,
    onMissedChange: (Boolean) -> Unit,
    priority: String,
    onPriorityChange: (String) -> Unit,
    notifyOffsetsMinutes: List<Double>,
    onNotifyOffsetsChange: (List<Double>) -> Unit,
    tagViewModel: TagSuggestionViewModel,
) {
    TextField(
        modifier = Modifier.fillMaxWidth(),
        value = name,
        onValueChange = onNameChange,
        label = { Text("Nome") },
        singleLine = true,
    )
    TextField(
        modifier = Modifier.fillMaxWidth(),
        value = description,
        onValueChange = onDescriptionChange,
        label = { Text("Descrição") },
        minLines = 2,
    )
    TagInput(tags = tags, onTagsChange = onTagsChange, viewModel = tagViewModel)
    TextField(
        modifier = Modifier.fillMaxWidth(),
        value = startedAt,
        onValueChange = onStartedAtChange,
        label = { Text("Início (AAAA-MM-DDTHH:MM)") },
        singleLine = true,
    )
    TextField(
        modifier = Modifier.fillMaxWidth(),
        value = finishedAt,
        onValueChange = onFinishedAtChange,
        label = { Text("Fim (opcional)") },
        singleLine = true,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { onMissedChange(!missed) }) {
            Text(if (missed) "Não realizado" else "Marcar como não realizado")
        }
    }
    SelectField(
        label = "Prioridade",
        options = priorityOptions,
        selected = priority,
        onSelect = onPriorityChange,
    )
    SelectField(
        label = "Lembrete",
        options = reminderOptions,
        selected = notifyOffsetsMinutes.selectedReminder(),
        onSelect = { minutes -> onNotifyOffsetsChange(if (minutes == 0.0) emptyList() else listOf(minutes)) },
    )
}

private val priorityOptions =
    listOf(
        SelectOption("urgent", "Urgente"),
        SelectOption("normal", "Normal"),
        SelectOption("flexible", "Flexível"),
    )

private fun updateInput(
    event: EventDetailDto,
    name: String,
    description: String,
    tags: List<String>,
    startedAt: String,
    finishedAt: String,
    missed: Boolean,
    priority: String,
    notifyOffsetsMinutes: List<Double>,
    notes: List<UpdateEventNoteDto>? = null,
): UpdateEventInputDto =
    UpdateEventInputDto(
        eventId = event.id,
        expectedRevision = event.revision,
        name = name.trim(),
        description = description.trim(),
        tags = tags,
        startedAt = isoValueOf(startedAt),
        finishedAt = finishedAt.takeIf(String::isNotBlank)?.let(::isoValueOf),
        missed = missed,
        priority = priority,
        notifyOffsetsMinutes = notifyOffsetsMinutes,
        notes = notes,
        taskIds = event.taskIds,
    )

private val editDateFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")

private fun localValueOf(instant: String): String =
    LocalDateTime
        .ofInstant(Instant.parse(instant), ZoneId.of(TIMELINE_TIME_ZONE))
        .format(editDateFormatter)

private fun isoValueOf(value: String): String =
    LocalDateTime
        .parse(value, editDateFormatter)
        .atZone(ZoneId.of(TIMELINE_TIME_ZONE))
        .toInstant()
        .toString()

@Composable
private fun EditMessage(
    modifier: Modifier,
    message: String,
    onAction: () -> Unit,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = message, color = MaterialTheme.colorScheme.error)
        Button(onClick = onAction) { Text("Tentar novamente") }
    }
}
