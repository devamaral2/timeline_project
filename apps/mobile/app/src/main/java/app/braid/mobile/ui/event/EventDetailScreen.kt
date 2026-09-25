@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.event

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.EventItemDto
import app.braid.mobile.data.dto.MealEventItemDto
import app.braid.mobile.data.dto.SleepEventItemDto
import app.braid.mobile.data.dto.TrainingEventItemDto
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.endLabelOf
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.domain.timeline.mediumDate

private data class DetailVisual(
    val icon: ImageVector,
    val label: String,
    val color: Color,
)

@Composable
@Suppress("ktlint:standard:function-naming")
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
fun EventDetailScreen(
    eventId: String,
    onBack: () -> Unit,
    onEdit: () -> Unit = {},
    onDeleted: () -> Unit = {},
    viewModel: EventDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showDeleteConfirmation by rememberSaveable(eventId) { mutableStateOf(false) }
    LaunchedEffect(eventId) { viewModel.load(eventId) }
    LaunchedEffect(state) {
        when (state) {
            EventDetailUiState.Deleted -> onDeleted()
            is EventDetailUiState.Content -> {
                if ((state as EventDetailUiState.Content).deleteError != null) {
                    showDeleteConfirmation = true
                }
            }
            else -> Unit
        }
    }
    val title = (state as? EventDetailUiState.Content)?.event?.name ?: "Evento"

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(title, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Voltar para a agenda")
                    }
                },
                actions = {
                    if (state is EventDetailUiState.Content) {
                        IconButton(onClick = onEdit) {
                            Icon(Icons.Outlined.Edit, contentDescription = "Editar evento")
                        }
                    }
                },
            )
        },
    ) { paddingValues ->
        when (val current = state) {
            EventDetailUiState.Loading ->
                Column(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator()
                }
            EventDetailUiState.Error ->
                DetailMessage(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    text = "Não foi possível carregar o evento.",
                    action = { viewModel.load(eventId) },
                )
            is EventDetailUiState.Content ->
                EventDetailBody(
                    event = current.event,
                    modifier = Modifier.padding(paddingValues),
                    onEdit = onEdit,
                    onDelete = { showDeleteConfirmation = true },
                    deleting = current.isDeleting,
                )
            EventDetailUiState.Deleted -> Unit
        }
    }

    val content = state as? EventDetailUiState.Content
    if (showDeleteConfirmation && content != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!content.isDeleting) showDeleteConfirmation = false },
            title = { Text("Excluir evento") },
            text = {
                Column {
                    Text("Tem certeza que deseja excluir \u201c${content.event.name}\u201d? Essa ação não pode ser desfeita.")
                    content.deleteError?.let { error ->
                        Text(
                            modifier = Modifier.padding(top = 10.dp),
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.delete(eventId) },
                    enabled = !content.isDeleting,
                ) {
                    Text(if (content.isDeleting) "Excluindo…" else "Excluir")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showDeleteConfirmation = false },
                    enabled = !content.isDeleting,
                ) {
                    Text("Cancelar")
                }
            },
        )
    }
}

@Composable
private fun EventDetailBody(
    event: EventDetailDto,
    modifier: Modifier,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    deleting: Boolean,
) {
    val primary = event.items.firstOrNull { it.id == event.primaryItemId }
    val visual = detailVisual(primary?.let(::typeOf))
    val dayKey = dayKeyOf(event.startedAt)

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(imageVector = visual.icon, contentDescription = visual.label, tint = visual.color)
            Spacer(modifier = Modifier.width(10.dp))
            Text(text = visual.label, style = MaterialTheme.typography.labelLarge, color = visual.color)
        }
        Text(text = event.name, style = MaterialTheme.typography.headlineSmall)
        Text(
            text = mediumDate(dayKey),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Schedule(event = event)

        if (event.description.isNotBlank()) {
            DetailSection(title = "Descrição") {
                Text(text = event.description, style = MaterialTheme.typography.bodyMedium)
            }
        }

        DetailSection(title = "Informações") {
            Text(text = "Prioridade: ${priorityLabel(event.priority)}")
            if (event.notifyOffsetsMinutes.isNotEmpty()) {
                Text(
                    text = "Notificar: ${event.notifyOffsetsMinutes.joinToString(", ") { "${it.toInt()} min antes" }}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        event.items.forEach { item -> ItemDetails(item) }

        if (event.tags.isNotEmpty()) {
            DetailSection(title = "Tags") {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    event.tags.forEach { tag -> TagChip(tag, visual.color) }
                }
            }
        }

        if (event.interruptions.isNotEmpty()) {
            DetailSection(title = "Interrupções") {
                event.interruptions.forEach { interruption ->
                    Text(text = "${interruption.name} · ${formatTime(interruption.startedAt)}–${formatTime(interruption.finishedAt)}")
                    if (interruption.description.isNotBlank()) {
                        Text(
                            text = interruption.description,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }

        if (!event.taskIds.isNullOrEmpty()) {
            DetailSection(title = "Tarefas vinculadas") {
                Text(text = "${event.taskIds.size} tarefa(s) vinculada(s)")
            }
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(modifier = Modifier.weight(1f), onClick = onEdit) {
                Icon(Icons.Outlined.Edit, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Editar")
            }
            Button(modifier = Modifier.weight(1f), onClick = onDelete, enabled = !deleting) {
                Icon(Icons.Outlined.DeleteOutline, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Excluir")
            }
        }
    }
}

@Composable
private fun Schedule(event: EventDetailDto) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            ScheduleValue("Início", formatTime(event.startedAt))
            ScheduleValue("Fim", endLabelOf(event.startedAt, event.finishedAt))
            event.finishedAt?.let {
                ScheduleValue("Duração", durationLabel(durationMinutesBetween(event.startedAt, it)))
            }
        }
    }
}

@Composable
private fun ScheduleValue(
    label: String,
    value: String,
) {
    Column {
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = value, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun ItemDetails(item: EventItemDto) {
    when (item) {
        is MealEventItemDto ->
            DetailSection(title = "Refeição") {
                Text(text = item.data.name, style = MaterialTheme.typography.titleSmall)
                if (item.data.description.isNotBlank()) Text(text = item.data.description)
                Text(text = "${item.data.foodItems.size} alimento(s) · ${item.data.totals.totalCaloriesKcal} kcal")
            }
        is TrainingEventItemDto ->
            if (item.data.workouts.isNotEmpty()) {
                DetailSection(title = "Treinos") {
                    item.data.workouts.forEach { workout ->
                        Text(text = "${workout.workoutName} · ${workout.duration} min · ${workout.calories} kcal")
                    }
                }
            }
        is SleepEventItemDto ->
            DetailSection(title = "Sono") {
                Text(text = "${item.data.trackedSleepTime} min monitorados · pontuação ${item.data.score}")
            }
        else -> Unit
    }
}

@Composable
private fun DetailSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text = title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider()
        content()
    }
}

@Composable
private fun TagChip(
    tag: String,
    color: Color,
) {
    Surface(shape = RoundedCornerShape(50), color = color.copy(alpha = 0.16f)) {
        Text(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            text = "#$tag",
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
    }
}

@Composable
private fun DetailMessage(
    modifier: Modifier,
    text: String,
    action: () -> Unit,
) {
    Column(
        modifier = modifier.padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = text, color = MaterialTheme.colorScheme.error)
        TextButton(onClick = action) { Text("Tentar novamente") }
    }
}

@Composable
private fun detailVisual(type: String?): DetailVisual {
    val colors = MaterialTheme.colorScheme
    return when (type) {
        "meal" -> DetailVisual(Icons.Outlined.Restaurant, "Refeição", colors.tertiary)
        "training" -> DetailVisual(Icons.Outlined.FitnessCenter, "Treino", colors.primary)
        "sleep" -> DetailVisual(Icons.Outlined.Bedtime, "Sono", colors.secondary)
        "routine" -> DetailVisual(Icons.Outlined.AccessTime, "Rotina", colors.secondary)
        else -> DetailVisual(Icons.Outlined.Circle, "Evento", colors.onSurfaceVariant)
    }
}

private fun typeOf(item: EventItemDto): String =
    when (item) {
        is MealEventItemDto -> "meal"
        is TrainingEventItemDto -> "training"
        is SleepEventItemDto -> "sleep"
        else -> "routine"
    }

private fun priorityLabel(priority: String): String =
    when (priority) {
        "urgent" -> "Urgente"
        "flexible" -> "Flexível"
        else -> "Normal"
    }

private fun durationLabel(minutes: Int): String {
    if (minutes < 60) return "$minutes min"
    val hours = minutes / 60
    val remainder = minutes % 60
    return if (remainder == 0) "$hours h" else "$hours h $remainder min"
}

private fun durationMinutesBetween(
    startedAt: String,
    finishedAt: String,
): Int =
    (
        (
            java.time.Instant
                .parse(finishedAt)
                .toEpochMilli() -
                java.time.Instant
                    .parse(startedAt)
                    .toEpochMilli()
        ) / 60_000
    ).toInt()
        .coerceAtLeast(0)
