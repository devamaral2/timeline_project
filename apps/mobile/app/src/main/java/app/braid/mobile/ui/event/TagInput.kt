package app.braid.mobile.ui.event

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.tagColors

@Composable
@Suppress("ktlint:standard:function-naming")
fun TagInput(
    tags: List<String>,
    onTagsChange: (List<String>) -> Unit,
    viewModel: TagSuggestionViewModel,
) {
    var draft by remember { mutableStateOf("") }
    val suggestions by viewModel.suggestions.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current

    LaunchedEffect(draft, tags) {
        viewModel.search(draft, tags)
    }

    fun commit(value: String) {
        val normalized = value.trim().lowercase()
        draft = ""
        viewModel.clear()
        focusManager.clearFocus()
        if (normalized.isNotEmpty() && normalized !in tags) {
            onTagsChange(tags + normalized)
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text = "Tags", style = MaterialTheme.typography.labelLarge)
        if (tags.isNotEmpty()) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                tags.forEach { tag ->
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = tagColors(tag).backgroundColor,
                    ) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Text(
                                modifier = Modifier.padding(start = 8.dp),
                                text = "#$tag",
                                color = tagColors(tag).color,
                                style = MaterialTheme.typography.labelSmall,
                            )
                            IconButton(
                                onClick = { onTagsChange(tags - tag) },
                                modifier = Modifier.padding(end = 2.dp),
                            ) {
                                Icon(Icons.Outlined.Close, contentDescription = "Remover tag $tag")
                            }
                        }
                    }
                }
            }
        }
        TextField(
            modifier = Modifier.fillMaxWidth(),
            value = draft,
            onValueChange = { draft = it },
            label = { Text("Adicionar tag") },
            placeholder = { Text("Ex.: foco, manhã") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { commit(draft) }),
        )
        suggestions.forEach { suggestion ->
            TextButton(onClick = { commit(suggestion.name) }) {
                Text(text = suggestion.name)
            }
        }
    }
}
