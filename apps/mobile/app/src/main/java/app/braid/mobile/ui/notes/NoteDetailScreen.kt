@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.notes

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.LinkOff
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.StickyNote2
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.TEXT_NOTE_TYPE
import app.braid.mobile.domain.notes.noteDatesLine
import app.braid.mobile.domain.notes.noteOriginLabel
import app.braid.mobile.domain.notes.whenLabel
import app.braid.mobile.ui.event.SectionLabel
import java.time.Instant

/** A nota aberta: origem, tags, datas e o texto — com editar, soltar e excluir no menu. */
@Composable
fun NoteDetailScreen(
    noteId: String,
    onBack: () -> Unit,
    onOpenEvent: (String) -> Unit = {},
    onDeleted: () -> Unit = {},
    viewModel: NoteDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(noteId) { viewModel.load(noteId) }
    LaunchedEffect(state) { if (state == NoteDetailUiState.Deleted) onDeleted() }

    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
        when (val current = state) {
            NoteDetailUiState.Loading ->
                Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            NoteDetailUiState.Error ->
                Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                    IconButton(onClick = onBack) { Icon(Icons.Outlined.ArrowBack, contentDescription = "Voltar para as notas") }
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text("Não foi possível carregar a nota.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = { viewModel.load(noteId) }) { Text("Tentar de novo") }
                    }
                }
            is NoteDetailUiState.Content ->
                NoteDetailBody(
                    state = current,
                    modifier = Modifier.padding(padding),
                    onBack = onBack,
                    onOpenEvent = onOpenEvent,
                    onEdit = viewModel::startEditing,
                    onDetach = viewModel::detach,
                    onDelete = viewModel::startDeleting,
                )
            NoteDetailUiState.Deleted -> Unit
        }
    }

    val content = state as? NoteDetailUiState.Content
    if (content != null && content.isEditing) {
        NoteEditorDialog(
            title = "Editar nota",
            initial = NoteDraft.of(content.note),
            isSaving = content.isSaving,
            error = content.actionError,
            onDismiss = viewModel::dismissEditing,
            onSave = viewModel::save,
        )
    }
    if (content != null && content.isDeleting) {
        AlertDialog(
            onDismissRequest = viewModel::dismissDeleting,
            title = { Text("Excluir nota") },
            text = {
                Column {
                    Text("Tem certeza que deseja excluir “${content.note.name}”? Essa ação não pode ser desfeita.")
                    content.actionError?.let { error ->
                        Text(modifier = Modifier.padding(top = 10.dp), text = error, color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = viewModel::delete, enabled = !content.isSaving) {
                    Text(if (content.isSaving) "Excluindo…" else "Excluir")
                }
            },
            dismissButton = { TextButton(onClick = viewModel::dismissDeleting, enabled = !content.isSaving) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun NoteDetailBody(
    state: NoteDetailUiState.Content,
    onBack: () -> Unit,
    onOpenEvent: (String) -> Unit,
    onEdit: () -> Unit,
    onDetach: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    now: Instant = Instant.now(),
) {
    val note = state.note
    var menuOpen by rememberSaveable(note.id) { mutableStateOf(false) }

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
                Text("Notas", color = MaterialTheme.colorScheme.onBackground)
            }
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(
                        Icons.Outlined.MoreVert,
                        contentDescription = "Mais ações: editar, soltar, excluir",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    // Só a nota de texto se edita aqui; refeição, sono e treino mudam no evento.
                    if (note.type == TEXT_NOTE_TYPE) {
                        DropdownMenuItem(
                            text = { Text("Editar") },
                            leadingIcon = { Icon(Icons.Outlined.Edit, contentDescription = null) },
                            onClick = {
                                menuOpen = false
                                onEdit()
                            },
                        )
                    }
                    if (note.link != null) {
                        DropdownMenuItem(
                            text = { Text("Soltar da origem") },
                            leadingIcon = { Icon(Icons.Outlined.LinkOff, contentDescription = null) },
                            enabled = !state.isSaving,
                            onClick = {
                                menuOpen = false
                                onDetach()
                            },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Excluir", color = MaterialTheme.colorScheme.error) },
                        leadingIcon = {
                            Icon(Icons.Outlined.DeleteOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        },
                        onClick = {
                            menuOpen = false
                            onDelete()
                        },
                    )
                }
            }
        }

        // O mesmo cartão da nota dentro do detalhe do evento (EventNoteCard).
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(
                            Icons.Outlined.StickyNote2,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        SectionLabel("Nota")
                    }
                    Text(note.name, style = MaterialTheme.typography.headlineSmall.copy(fontSize = 26.sp, lineHeight = 30.sp))
                }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    NoteOriginLink(note, now, onOpenEvent)
                    NoteTags(note.tags)
                    Text(
                        text = noteDatesLine(note, now),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                NoteContent(note)
            }
        }
        state.actionError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

/** De onde a nota vem; o evento abre o detalhe dele, a tarefa ainda não tem tela. */
@Composable
private fun NoteOriginLink(
    note: NoteDto,
    now: Instant,
    onOpenEvent: (String) -> Unit,
) {
    val link = note.link ?: return
    val visual = noteOriginVisual(note)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val opensEvent = link.kind == "event"
    Row(
        modifier =
            Modifier
                .heightIn(min = 44.dp)
                .padding(vertical = 0.dp)
                .let { if (opensEvent) it.clickable { onOpenEvent(link.id) } else it },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(visual.icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = visual.color)
        Text(
            modifier = Modifier.weight(1f, fill = false),
            text = noteOriginLabel(note),
            style = MaterialTheme.typography.bodyMedium,
            color = muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        link.at?.let { Text("· ${whenLabel(it, now)}", style = MaterialTheme.typography.bodyMedium, color = muted) }
        if (opensEvent) Icon(Icons.Outlined.KeyboardArrowRight, contentDescription = null, modifier = Modifier.size(16.dp), tint = muted)
    }
}
