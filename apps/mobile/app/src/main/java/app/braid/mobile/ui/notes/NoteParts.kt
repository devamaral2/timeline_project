@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.notes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.data.dto.MealItemDto
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.domain.notes.noteMarkdownOf
import app.braid.mobile.ui.event.MealNote
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement

/** As tags da nota em chips coloridos, no mesmo desenho do cartão de evento. */
@Composable
@OptIn(ExperimentalLayoutApi::class)
internal fun NoteTags(
    tags: List<String>,
    modifier: Modifier = Modifier,
) {
    if (tags.isEmpty()) return
    val dark = LocalBraidDarkTheme.current
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        tags.forEach { tag ->
            val colors = tagColors(tag, dark)
            Surface(shape = RoundedCornerShape(5.dp), color = colors.backgroundColor) {
                Text(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    text = "#$tag",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.5.sp, fontWeight = FontWeight.Medium),
                    color = colors.color,
                )
            }
        }
    }
}

/** O texto da nota, lido como markdown. */
@Composable
internal fun NoteContent(
    note: NoteDto,
    modifier: Modifier = Modifier,
) {
    if (note.type == "meal") {
        val meal = runCatching { Json { ignoreUnknownKeys = true }.decodeFromJsonElement<MealItemDto>(note.data) }.getOrNull()
        if (meal != null) {
            MealNote(meal)
            return
        }
    }
    MarkdownText(source = noteMarkdownOf(note), modifier = modifier)
}
