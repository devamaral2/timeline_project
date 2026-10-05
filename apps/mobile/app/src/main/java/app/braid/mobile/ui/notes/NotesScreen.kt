@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.notes

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidNoteExcerptStyle
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.domain.notes.groupNotesByTag
import app.braid.mobile.domain.notes.noteOriginLabel
import app.braid.mobile.domain.notes.noteSnippet
import app.braid.mobile.domain.notes.noteStamp
import java.time.Instant

/** Notas agrupadas por tag, com seleção e grupos recolhíveis. */
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
        onToggleTag = viewModel::toggleTag,
        onToggleGroup = viewModel::toggleGroup,
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
internal fun NotesContent(
    state: NotesUiState,
    onOpenNote: (String) -> Unit,
    onToggleTag: (String) -> Unit,
    onToggleGroup: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    now: Instant = Instant.now(),
) {
    val notes = state.notes
    val allGroups = remember(notes) { groupNotesByTag(notes.orEmpty()) }
    val groups = allGroups.filter { it.key !in state.hiddenTags }
    var optionsOpen by remember { mutableStateOf(false) }

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
                    Box {
                        IconButton(onClick = { optionsOpen = true }) {
                            Icon(LucideIcons.slidersHorizontal(), contentDescription = "Opções de visualização")
                        }
                        DropdownMenu(expanded = optionsOpen, onDismissRequest = { optionsOpen = false }) {
                            Text("Tags exibidas", modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.labelMedium)
                            if (allGroups.isEmpty()) {
                                Text("Nenhuma tag disponível.", modifier = Modifier.padding(12.dp))
                            }
                            allGroups.forEach { group ->
                                DropdownMenuItem(
                                    text = { Text(group.label) },
                                    leadingIcon = { Checkbox(checked = group.key !in state.hiddenTags, onCheckedChange = null) },
                                    modifier = Modifier.semantics { selected = group.key !in state.hiddenTags },
                                    onClick = { onToggleTag(group.key) },
                                )
                            }
                        }
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
                        text = "Você ainda não tem notas.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            groups.isEmpty() ->
                item {
                    Text(
                        modifier = Modifier.padding(vertical = 24.dp),
                        text = "Nenhuma tag selecionada. Escolha as tags no menu de opções.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            else ->
                groups.forEach { group ->
                    item(key = "group-${group.key}") {
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .clickable { onToggleGroup(group.key) }
                                    .semantics { stateDescription = if (group.key in state.collapsedTags) "Recolhido" else "Expandido" }
                                    .padding(top = 16.dp, bottom = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.Bottom,
                        ) {
                            Icon(
                                LucideIcons.chevronDown(),
                                contentDescription = null,
                                modifier = Modifier.size(18.dp).rotate(if (group.key in state.collapsedTags) -90f else 0f),
                            )
                            Text(
                                text = group.label,
                                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 1.3.sp),
                            )
                            Text(
                                text = group.notes.size.toString(),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (group.key !in state.collapsedTags) {
                        items(group.notes, key = { "${group.key.length}:${group.key}:${it.id}" }) { note ->
                            NoteCard(note, now) { onOpenNote(note.id) }
                        }
                    }
                }
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
                    style = BraidNoteExcerptStyle,
                    color = muted,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            NoteTags(note.tags)
        }
    }
}
