package app.braid.mobile.ui.assistant

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.domain.chat.plainText
import app.braid.mobile.domain.markdown.MarkdownBlock
import app.braid.mobile.domain.markdown.parseMarkdown

/**
 * A resposta do agente no painel do assistente: o markdown lido em texto corrido, com listas, títulos e código simples. O
 * chat do app tem um desenho mais rico (`ChatAnswer`); aqui basta ler a resposta, e o painel não depende dele.
 */
@Composable
fun AssistantAnswer(
    text: String,
    modifier: Modifier = Modifier,
) {
    val blocks = remember(text) { parseMarkdown(text) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) { Blocks(blocks) }
}

@Composable
private fun Blocks(blocks: List<MarkdownBlock>) {
    val color = MaterialTheme.colorScheme.onBackground
    blocks.forEach { block ->
        when (block) {
            is MarkdownBlock.Paragraph -> Text(plainText(block.content), color = color, fontSize = 17.sp, lineHeight = 26.sp)
            is MarkdownBlock.Heading ->
                Text(plainText(block.content), color = color, fontSize = 17.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold)
            is MarkdownBlock.Code ->
                Text(block.text, color = color, fontFamily = BraidMonoFont, fontSize = 14.sp, lineHeight = 20.sp)
            is MarkdownBlock.ListBlock ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    block.items.forEachIndexed { index, item ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                if (block.ordered) "${block.start + index}." else "•",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 17.sp,
                                lineHeight = 26.sp,
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { Blocks(item.blocks) }
                        }
                    }
                }
            is MarkdownBlock.Quote -> Column(Modifier.padding(start = 12.dp)) { Blocks(block.blocks) }
            MarkdownBlock.Rule -> Unit
            is MarkdownBlock.Table ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    block.rows.forEach { row ->
                        Text(row.joinToString(" · ") { plainText(it) }, color = color, fontSize = 15.sp, lineHeight = 22.sp)
                    }
                }
        }
    }
}
