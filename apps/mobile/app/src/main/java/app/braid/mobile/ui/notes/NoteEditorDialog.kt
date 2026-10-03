@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.notes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.braid.mobile.ui.event.TagInput
import app.braid.mobile.ui.event.TagSuggestionViewModel

/** Cria ou edita uma nota: título opcional, texto e tags. */
@Composable
fun NoteEditorDialog(
    title: String,
    initial: NoteDraft,
    isSaving: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (NoteDraft) -> Unit,
    tagViewModel: TagSuggestionViewModel = hiltViewModel(),
) {
    var name by rememberSaveable { mutableStateOf(initial.name) }
    var content by rememberSaveable { mutableStateOf(initial.content) }
    var tags by rememberSaveable { mutableStateOf(initial.tags) }
    var showBlankError by rememberSaveable { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!isSaving) onDismiss() },
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Título") },
                    placeholder = { Text("Opcional — vem da primeira linha") },
                    singleLine = true,
                    enabled = !isSaving,
                )
                OutlinedTextField(
                    modifier = Modifier.fillMaxWidth(),
                    value = content,
                    onValueChange = {
                        content = it
                        showBlankError = false
                    },
                    label = { Text("Texto") },
                    placeholder = { Text("Use ## para subtítulos e - para listas.") },
                    minLines = 6,
                    isError = showBlankError,
                    enabled = !isSaving,
                )
                TagInput(tags = tags, onTagsChange = { tags = it }, viewModel = tagViewModel)
                val message = if (showBlankError) "Escreva o texto da nota." else error
                if (message != null) {
                    Text(
                        modifier = Modifier.padding(top = 2.dp),
                        text = message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !isSaving,
                onClick = {
                    val draft = NoteDraft(name = name, content = content, tags = tags)
                    if (draft.isBlank) showBlankError = true else onSave(draft)
                },
            ) { Text(if (isSaving) "Salvando…" else "Salvar") }
        },
        dismissButton = { TextButton(enabled = !isSaving, onClick = onDismiss) { Text("Cancelar") } },
    )
}
