@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.event

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.domain.timeline.EventPosition
import app.braid.mobile.domain.timeline.dateLineOf
import app.braid.mobile.domain.timeline.endLabelOf
import app.braid.mobile.domain.timeline.eventPositionOf
import app.braid.mobile.domain.timeline.formatMinutes
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.domain.timeline.minutesBetween
import app.braid.mobile.domain.timeline.pluralize

private data class DetailVisual(
    val icon: ImageVector,
    val label: String,
    val color: Color,
)

@Composable
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

    Scaffold(containerColor = MaterialTheme.colorScheme.background) { paddingValues ->
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
                Column(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Voltar para a agenda")
                    }
                    DetailMessage(
                        modifier = Modifier.fillMaxSize(),
                        text = "Não foi possível carregar o evento.",
                        action = { viewModel.load(eventId) },
                    )
                }
            is EventDetailUiState.Content ->
                EventDetailBody(
                    state = current,
                    modifier = Modifier.padding(paddingValues),
                    onBack = onBack,
                    onEdit = onEdit,
                    onDelete = { showDeleteConfirmation = true },
                    onToggleMissed = { viewModel.setMissed(!current.event.missed) },
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
    state: EventDetailUiState.Content,
    modifier: Modifier,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onToggleMissed: () -> Unit,
) {
    val event = state.event
    val visual = detailVisual(event.kind)
    val position = eventPositionOf(event.startedAt, event.finishedAt)
    val agendaMinutes = event.finishedAt?.let { minutesBetween(event.startedAt, it) }
    val dateLine = dateLineOf(event.startedAt, event.finishedAt)
    var menuOpen by rememberSaveable(event.id) { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 44.dp)) {
                Icon(Icons.Outlined.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Agenda", color = MaterialTheme.colorScheme.onBackground)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onEdit) {
                    Icon(Icons.Outlined.Edit, contentDescription = "Editar evento", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(Icons.Outlined.MoreVert, contentDescription = "Mais ações", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("Excluir", color = MaterialTheme.colorScheme.error) },
                            leadingIcon = {
                                Icon(
                                    Icons.Outlined.DeleteOutline,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            },
                            enabled = !state.isDeleting,
                            onClick = {
                                menuOpen = false
                                onDelete()
                            },
                        )
                    }
                }
            }
        }

        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(visual.icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = visual.color)
                    SectionLabelColored(visual.label, visual.color)
                }
                StatusIcon(position = position, missed = event.missed, saving = state.isSavingMissed, onToggle = onToggleMissed)
            }
            Text(
                text = event.name,
                modifier = Modifier.padding(top = 18.dp, bottom = 12.dp),
                style = MaterialTheme.typography.displaySmall,
            )
            Text(dateLine, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                text =
                    "${formatTime(event.startedAt)} → ${endLabelOf(event.startedAt, event.finishedAt)}" +
                        (agendaMinutes?.let { " · ${formatMinutes(it.toDouble())}" } ?: ""),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
        }
        state.missedError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

        if (event.notifyOffsetsMinutes.isNotEmpty() || event.tags.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (event.notifyOffsetsMinutes.isNotEmpty()) {
                    InfoRow(Icons.Outlined.NotificationsNone) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            event.notifyOffsetsMinutes.forEach { Text(notificationLabel(it), style = MaterialTheme.typography.bodyMedium) }
                        }
                    }
                }
                if (event.tags.isNotEmpty()) {
                    InfoRow(Icons.Outlined.Sell) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            event.tags.forEach { tag -> TagChip(tag) }
                        }
                    }
                }
            }
        }

        if (event.description.isNotBlank()) {
            Description(event.description)
        }

        EventNotesSection(notes = event.notes, eventName = event.name, dateTitle = dateLine, agendaMinutes = agendaMinutes)

        val linkedTasks = event.taskIds?.size ?: 0
        if (event.interruptions.isNotEmpty() || linkedTasks > 0) {
            Column {
                if (event.interruptions.isNotEmpty()) {
                    CollapsibleRow(
                        title = "Interrupções",
                        summary = pluralize(event.interruptions.size, "interrupção", "interrupções"),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            event.interruptions.forEach { interruption ->
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(interruption.name, style = MaterialTheme.typography.bodyMedium)
                                        if (interruption.description.isNotBlank()) {
                                            Text(
                                                interruption.description,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                    Text(
                                        formatMinutes(minutesBetween(interruption.startedAt, interruption.finishedAt).toDouble()),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
                if (linkedTasks > 0) {
                    CollapsibleRow(title = "Tarefas vinculadas", summary = pluralize(linkedTasks, "tarefa", "tarefas"), content = null)
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}

/** Só o ícone, sem texto; depois do horário vira botão que alterna aconteceu / não realizado. */
@Composable
private fun StatusIcon(
    position: EventPosition,
    missed: Boolean,
    saving: Boolean,
    onToggle: () -> Unit,
) {
    val (icon, label, tint) =
        when {
            missed -> Triple(Icons.Outlined.EventBusy, "Não realizado", MaterialTheme.colorScheme.error)
            position == EventPosition.Past -> Triple(Icons.Outlined.EventAvailable, "Aconteceu", MaterialTheme.colorScheme.onBackground)
            position == EventPosition.Running -> Triple(Icons.Outlined.CalendarMonth, "Em andamento", MaterialTheme.colorScheme.tertiary)
            else -> Triple(Icons.Outlined.CalendarToday, "Vai acontecer", MaterialTheme.colorScheme.onSurfaceVariant)
        }
    if (position == EventPosition.Past) {
        val action = if (missed) "aconteceu" else "não realizado"
        IconButton(
            onClick = onToggle,
            enabled = !saving,
            modifier = Modifier.semantics { contentDescription = "Situação: $label. Toque para marcar como $action" },
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(28.dp), tint = tint)
        }
    } else {
        Box(modifier = Modifier.size(48.dp), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = "Situação: $label", modifier = Modifier.size(28.dp), tint = tint)
        }
    }
}

@Composable
private fun SectionLabelColored(
    text: String,
    color: Color,
) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.3.sp),
        color = color,
    )
}

@Composable
private fun InfoRow(
    icon: ImageVector,
    content: @Composable () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

/** Até 3 linhas; passando disso, "Ler mais". */
@Composable
private fun Description(text: String) {
    var expanded by rememberSaveable(text) { mutableStateOf(false) }
    var overflows by rememberSaveable(text) { mutableStateOf(false) }
    Column {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = if (expanded) Int.MAX_VALUE else 3,
            overflow = TextOverflow.Ellipsis,
            onTextLayout = { if (!expanded) overflows = it.hasVisualOverflow },
        )
        if (overflows || expanded) {
            TextButton(onClick = { expanded = !expanded }, modifier = Modifier.heightIn(min = 44.dp)) {
                Text(if (expanded) "Ler menos" else "Ler mais", color = MaterialTheme.colorScheme.tertiary)
            }
        }
    }
}

/** Sanfona dentro da própria tela; fechada, a linha já diz quanto tem dentro. */
@Composable
private fun CollapsibleRow(
    title: String,
    summary: String,
    content: (@Composable () -> Unit)?,
) {
    var open by rememberSaveable(title) { mutableStateOf(false) }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .let {
                    if (content !=
                        null
                    ) {
                        it.clickable { open = !open }
                    } else {
                        it
                    }
                }.heightIn(min = 56.dp)
                .padding(top = 14.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (content != null) {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = if (open) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
                    contentDescription = if (open) "Recolher $title" else "Expandir $title",
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (open) Column(modifier = Modifier.padding(top = 4.dp, bottom = 10.dp)) { content() }
        }
    }
}

@Composable
private fun TagChip(tag: String) {
    val colors = tagColors(tag, LocalBraidDarkTheme.current)
    Surface(shape = MaterialTheme.shapes.extraSmall, color = colors.backgroundColor) {
        Text(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            text = "#$tag",
            style = MaterialTheme.typography.labelMedium,
            color = colors.color,
        )
    }
}

private fun notificationLabel(minutes: Double): String {
    val value = minutes.toInt()
    if (value % 1440 == 0) return pluralize(value / 1440, "dia", "dias") + " antes"
    return pluralize(value, "minuto", "minutos") + " antes"
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
    val palette = eventDetailPalette()
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    return when (type) {
        "meal" -> DetailVisual(Icons.Outlined.Restaurant, "Refeição", palette.meal)
        "training" -> DetailVisual(Icons.Outlined.FitnessCenter, "Treino", palette.training)
        "sleep" -> DetailVisual(Icons.Outlined.Bedtime, "Sono", palette.sleep)
        "routine" -> DetailVisual(Icons.Outlined.AccessTime, "Rotina", palette.routine)
        else -> DetailVisual(Icons.Outlined.Circle, "Evento", muted)
    }
}
