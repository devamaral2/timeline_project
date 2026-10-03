@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.domain.notes.NoteBlock
import app.braid.mobile.domain.notes.parseNoteContent

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

/** O texto da nota em parágrafos, subtítulos e listas. */
@Composable
internal fun NoteContent(
    note: NoteDto,
    modifier: Modifier = Modifier,
) {
    val body = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp, lineHeight = 29.sp)
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        parseNoteContent(note).forEach { block ->
            when (block) {
                is NoteBlock.Paragraph -> Text(text = block.text, style = body)
                is NoteBlock.Heading ->
                    Text(
                        modifier = Modifier.padding(top = 12.dp),
                        text = block.text,
                        style = MaterialTheme.typography.headlineMedium,
                    )
                is NoteBlock.Bullets ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        block.items.forEach { item ->
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                                Box(
                                    Modifier
                                        .padding(top = 12.dp)
                                        .size(5.dp)
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.onSurfaceVariant),
                                )
                                Text(text = item, style = body)
                            }
                        }
                    }
            }
        }
    }
}
