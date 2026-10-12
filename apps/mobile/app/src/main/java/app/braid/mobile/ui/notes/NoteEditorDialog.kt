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
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.domain.notes.continueMarkdownList
import app.braid.mobile.ui.event.TagInput
import app.braid.mobile.ui.event.TagSuggestionViewModel

/** Como o editor mostra o texto: a fonte em markdown ou a leitura dela (no celular, uma de cada vez). */
private enum class EditorMode(
    val label: String,
) {
    Write("Escrever"),
    Read("Visualizar"),
}

/** Cria ou edita uma nota: título opcional, texto em markdown (com visualização) e tags. */
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
    var content by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(initial.content)) }
    var mode by rememberSaveable { mutableStateOf(EditorMode.Write) }
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
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    EditorMode.entries.forEachIndexed { index, option ->
                        SegmentedButton(
                            selected = mode == option,
                            onClick = { mode = option },
                            shape = SegmentedButtonDefaults.itemShape(index, EditorMode.entries.size),
                        ) { Text(option.label) }
                    }
                }
                if (mode == EditorMode.Write) {
                    OutlinedTextField(
                        modifier = Modifier.fillMaxWidth(),
                        value = content,
                        onValueChange = { next ->
                            content = continuedList(content, next) ?: next
                            showBlankError = false
                        },
                        label = { Text("Texto") },
                        placeholder = { Text("Markdown: ## subtítulo, **negrito**, - lista, - [ ] tarefa.") },
                        textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = BraidMonoFont),
                        minLines = 8,
                        isError = showBlankError,
                        enabled = !isSaving,
                    )
                } else if (content.text.isBlank()) {
                    Text(
                        "Nada para visualizar ainda.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    MarkdownText(source = content.text)
                }
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
                    val draft = NoteDraft(name = name, content = content.text, tags = tags)
                    if (draft.isBlank) showBlankError = true else onSave(draft)
                },
            ) { Text(if (isSaving) "Salvando…" else "Salvar") }
        },
        dismissButton = { TextButton(enabled = !isSaving, onClick = onDismiss) { Text("Cancelar") } },
    )
}

/**
 * Enter dentro de uma lista abre o próximo item (ou encerra a lista, se o item
 * está vazio). O teclado do celular só insere o `\n`; aqui ele é desfeito e a
 * regra do markdown é aplicada no lugar. `null` quando não foi um Enter.
 */
private fun continuedList(
    previous: TextFieldValue,
    next: TextFieldValue,
): TextFieldValue? {
    val cursor = next.selection.start
    val insertedNewline =
        next.selection.collapsed &&
            next.text.length == previous.text.length + 1 &&
            next.text.getOrNull(cursor - 1) == '\n' &&
            next.text.removeRange(cursor - 1, cursor) == previous.text
    if (!insertedNewline) return null
    val edit = continueMarkdownList(previous.text, cursor - 1) ?: return null
    return TextFieldValue(edit.value, TextRange(edit.cursor))
}
