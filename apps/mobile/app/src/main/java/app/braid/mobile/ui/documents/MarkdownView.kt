package app.braid.mobile.ui.documents

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.markdown.MarkdownBlock
import app.braid.mobile.domain.markdown.MarkdownInline
import app.braid.mobile.domain.markdown.MarkdownListItem
import app.braid.mobile.domain.markdown.parseMarkdown

/**
 * O markdown de um documento de texto, como o `MarkdownView` do web: títulos, listas, ênfase, código e links. O
 * `#` desce para o tamanho de seção, porque o título da tela é o nome do documento; a caixa de tarefa é só leitura.
 */
@Composable
fun MarkdownView(
    source: String,
    modifier: Modifier = Modifier,
) {
    val blocks = remember(source) { parseMarkdown(source) }
    MarkdownBlocks(blocks, modifier)
}

@Composable
private fun MarkdownBlocks(
    blocks: List<MarkdownBlock>,
    modifier: Modifier = Modifier,
    spacing: Int = 12,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(spacing.dp)) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Heading -> HeadingBlock(block)
                is MarkdownBlock.Paragraph -> InlineText(block.content, BODY)
                is MarkdownBlock.ListBlock -> ListBlock(block)
                is MarkdownBlock.Code -> CodeBlock(block.text)
                is MarkdownBlock.Quote -> QuoteBlock(block)
                MarkdownBlock.Rule -> HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                is MarkdownBlock.Table -> TableBlock(block)
            }
        }
    }
}

private val BODY = TextStyle(fontSize = 16.sp, lineHeight = 26.sp)

@Composable
private fun HeadingBlock(block: MarkdownBlock.Heading) {
    val style =
        when (block.level) {
            1 -> TextStyle(fontFamily = BraidDisplayFont, fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Normal)
            2 -> TextStyle(fontSize = 18.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold)
            else -> TextStyle(fontSize = 15.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold)
        }
    InlineText(block.content, style, Modifier.padding(top = 4.dp))
}

@Composable
private fun InlineText(
    content: List<MarkdownInline>,
    style: TextStyle,
    modifier: Modifier = Modifier,
) {
    val wash = MaterialTheme.colorScheme.onBackground.copy(alpha = WASH_ALPHA)
    val text = remember(content, wash) { annotated(content, wash) }
    Text(
        text = text,
        modifier = modifier,
        style = style,
        color = MaterialTheme.colorScheme.onBackground,
    )
}

private const val WASH_ALPHA = 0.07f

private fun annotated(
    content: List<MarkdownInline>,
    wash: Color,
): AnnotatedString =
    buildAnnotatedString {
        fun append(nodes: List<MarkdownInline>) {
            for (node in nodes) {
                when (node) {
                    is MarkdownInline.Text -> append(node.text)
                    MarkdownInline.LineBreak -> append("\n")
                    is MarkdownInline.Strong -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(node.content) }
                    is MarkdownInline.Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(node.content) }
                    is MarkdownInline.Strike ->
                        withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { append(node.content) }
                    is MarkdownInline.Code ->
                        withStyle(SpanStyle(fontFamily = BraidMonoFont, fontSize = 0.88.em, background = wash)) { append(node.text) }
                    is MarkdownInline.Link -> {
                        val style = SpanStyle(textDecoration = TextDecoration.Underline)
                        // Só endereços de fora abrem; um caminho relativo do web não tem para onde ir no app.
                        if (opensOutside(node.href)) {
                            withLink(LinkAnnotation.Url(node.href, TextLinkStyles(style))) { append(node.content) }
                        } else {
                            withStyle(style) { append(node.content) }
                        }
                    }
                }
            }
        }
        append(content)
    }

private fun opensOutside(href: String): Boolean =
    href.startsWith("http://", true) || href.startsWith("https://", true) || href.startsWith("mailto:", true)

@Composable
private fun ListBlock(block: MarkdownBlock.ListBlock) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        block.items.forEachIndexed { position, item ->
            Row(horizontalArrangement = Arrangement.spacedBy(if (item.checked != null) 10.dp else 8.dp)) {
                ListMarker(block, item, position)
                MarkdownBlocks(item.blocks, Modifier.weight(1f), spacing = 6)
            }
        }
    }
}

@Composable
private fun ListMarker(
    list: MarkdownBlock.ListBlock,
    item: MarkdownListItem,
    position: Int,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    when {
        item.checked != null -> ReadOnlyCheckbox(item.checked == true)
        list.ordered -> Text("${list.start + position}.", color = muted, style = BODY, modifier = Modifier.width(24.dp))
        else -> Text("•", color = muted, style = BODY, modifier = Modifier.width(14.dp))
    }
}

/** A caixa de uma lista de tarefas: só leitura, e o leitor de tela diz se está feita. */
@Composable
private fun ReadOnlyCheckbox(checked: Boolean) {
    val ink = MaterialTheme.colorScheme.onBackground
    Box(
        Modifier
            .padding(top = 5.dp)
            .size(16.dp)
            .semantics { contentDescription = if (checked) "Feito" else "A fazer" }
            .then(
                if (checked) Modifier.background(ink, RoundedCornerShape(4.dp)) else Modifier.border(1.5.dp, ink, RoundedCornerShape(4.dp)),
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (checked) SvgIcon(BraidIcons.check, size = 12.dp, color = MaterialTheme.colorScheme.background, strokeWidth = 3f)
    }
}

@Composable
private fun CodeBlock(text: String) {
    val wash = MaterialTheme.colorScheme.onBackground.copy(alpha = WASH_ALPHA)
    Box(
        Modifier
            .fillMaxWidth()
            .background(
                wash,
                RoundedCornerShape(10.dp),
            ).horizontalScroll(rememberScrollState())
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(
            text = text,
            color = MaterialTheme.colorScheme.onBackground,
            fontFamily = BraidMonoFont,
            fontSize = 12.5.sp,
            lineHeight = 19.sp,
        )
    }
}

@Composable
private fun QuoteBlock(block: MarkdownBlock.Quote) {
    val line = MaterialTheme.colorScheme.outline
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        Box(Modifier.width(2.dp).fillMaxHeight().background(line))
        MarkdownBlocks(block.blocks, Modifier.padding(start = 14.dp, top = 2.dp, bottom = 2.dp), spacing = 8)
    }
}

@Composable
private fun TableBlock(block: MarkdownBlock.Table) {
    val line = MaterialTheme.colorScheme.outline
    val wash = MaterialTheme.colorScheme.onBackground.copy(alpha = WASH_ALPHA)
    Column(Modifier.horizontalScroll(rememberScrollState())) {
        TableRow(block.header, line, header = true, background = wash)
        block.rows.forEach { TableRow(it, line, header = false, background = Color.Transparent) }
    }
}

@Composable
private fun TableRow(
    cells: List<List<MarkdownInline>>,
    line: Color,
    header: Boolean,
    background: Color,
) {
    Row {
        cells.forEach { cell ->
            Box(
                Modifier
                    .width(TABLE_CELL_WIDTH)
                    .border(0.5.dp, line)
                    .background(background)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                InlineText(
                    cell,
                    TextStyle(fontSize = 13.sp, lineHeight = 20.sp, fontWeight = if (header) FontWeight.SemiBold else FontWeight.Normal),
                )
            }
        }
    }
}

private val TABLE_CELL_WIDTH = 132.dp
