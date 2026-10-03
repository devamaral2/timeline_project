@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.notes

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.domain.notes.NoteFilter
import app.braid.mobile.domain.notes.filterNotes
import app.braid.mobile.domain.notes.groupNotes
import app.braid.mobile.domain.notes.noteOriginLabel
import app.braid.mobile.domain.notes.noteSnippet
import app.braid.mobile.domain.notes.noteStamp
import java.time.Instant

/** A lista de notas: filtros por origem, busca e grupos por dia. */
@Composable
fun NotesScreen(
    onOpenNote: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // A tela volta a ser composta ao retornar de uma nota: recarregar aqui pega edições e exclusões.
    LaunchedEffect(Unit) { viewModel.load() }
    LaunchedEffect(viewModel) {
        viewModel.uiEvents.collect { event ->
            when (event) {
                is NotesEvent.OpenNote -> onOpenNote(event.noteId)
            }
        }
    }

    NotesContent(
        state = state,
        modifier = modifier,
        onOpenNote = onOpenNote,
        onFilter = viewModel::setFilter,
        onQuery = viewModel::setQuery,
        onToggleSearch = viewModel::toggleSearch,
        onCreate = viewModel::startCreating,
        onRetry = viewModel::load,
    )

    if (state.isCreating) {
        NoteEditorDialog(
            title = "Nova nota",
            initial = NoteDraft(),
            isSaving = state.isSaving,
            error = state.saveError,
            onDismiss = viewModel::dismissCreating,
            onSave = viewModel::create,
        )
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
internal fun NotesContent(
    state: NotesUiState,
    onOpenNote: (String) -> Unit,
    onFilter: (NoteFilter) -> Unit,
    onQuery: (String) -> Unit,
    onToggleSearch: () -> Unit,
    onCreate: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    now: Instant = Instant.now(),
) {
    val notes = state.notes
    val visible = remember(notes, state.filter, state.query) { notes?.let { filterNotes(it, state.filter, state.query) }.orEmpty() }
    val groups = remember(visible, now) { groupNotes(visible, now) }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding =
            androidx.compose.foundation.layout
                .PaddingValues(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        modifier = Modifier.weight(1f),
                        text = "Notas",
                        style = MaterialTheme.typography.displayMedium,
                    )
                    IconButton(onClick = onToggleSearch) {
                        val colors = MaterialTheme.colorScheme
                        Icon(
                            Icons.Outlined.Search,
                            contentDescription = "Buscar notas",
                            tint = if (state.isSearching) colors.onBackground else colors.onSurfaceVariant,
                        )
                    }
                    FilledIconButton(onClick = onCreate) {
                        Icon(Icons.Outlined.Add, contentDescription = "Nova nota")
                    }
                }
                Text(
                    text =
                        if (notes == null) {
                            " "
                        } else if (notes.size == 1) {
                            "1 nota"
                        } else {
                            "${notes.size} notas"
                        },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (state.isSearching) {
            item {
                OutlinedTextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = state.query,
                    onValueChange = onQuery,
                    placeholder = { Text("Buscar em título, texto e tags") },
                    singleLine = true,
                    shape = CircleShape,
                )
            }
        }
        item {
            FlowRow(
                modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                NoteFilter.entries.forEach { filter -> FilterPill(filter.label, state.filter == filter) { onFilter(filter) } }
            }
        }

        when {
            state.loadFailed && notes == null ->
                item {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                    ) {
                        Text("Não foi possível carregar as notas.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = onRetry) { Text("Tentar de novo") }
                    }
                }
            notes == null ->
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            notes.isEmpty() ->
                item {
                    Text(
                        modifier = Modifier.padding(vertical = 24.dp),
                        text = "Você ainda não tem notas. Toque em + para escrever a primeira.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            visible.isEmpty() ->
                item {
                    Text(
                        modifier = Modifier.padding(vertical = 24.dp),
                        text = "Nenhuma nota encontrada.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            else ->
                groups.forEach { group ->
                    item(key = "group-${group.key}") {
                        Row(
                            modifier = Modifier.padding(top = 16.dp, bottom = 0.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            Text(
                                text = group.label.uppercase(),
                                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 1.3.sp),
                            )
                            Text(
                                text = group.notes.size.toString(),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    items(group.notes, key = { it.id }) { note -> NoteCard(note, now) { onOpenNote(note.id) } }
                }
        }
    }
}

@Composable
private fun FilterPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val ink = MaterialTheme.colorScheme.onBackground
    Surface(
        onClick = onClick,
        modifier = Modifier.heightIn(min = 36.dp).semantics { this.selected = selected },
        shape = CircleShape,
        color = if (selected) MaterialTheme.colorScheme.surface else androidx.compose.ui.graphics.Color.Transparent,
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) ink else MaterialTheme.colorScheme.outline),
    ) {
        Box(modifier = Modifier.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium),
                color = if (selected) ink else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun NoteCard(
    note: NoteDto,
    now: Instant,
    onClick: () -> Unit,
) {
    val visual = noteOriginVisual(note)
    val snippet = noteSnippet(note)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Nota: ${note.name}" },
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(visual.icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = visual.color)
                    Text(
                        text = noteOriginLabel(note),
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.5.sp),
                        color = muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = noteStamp(note.updatedAt, now),
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                    color = muted,
                )
            }
            Text(text = note.name, style = MaterialTheme.typography.headlineSmall)
            if (snippet.isNotEmpty()) {
                Text(
                    text = snippet,
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 21.sp),
                    color = muted,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            NoteTags(note.tags)
        }
    }
}
