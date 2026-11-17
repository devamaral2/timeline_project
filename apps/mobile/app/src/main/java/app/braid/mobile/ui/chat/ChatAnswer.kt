package app.braid.mobile.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
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
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.chat.PolishedParagraph
import app.braid.mobile.domain.chat.choiceLabel
import app.braid.mobile.domain.chat.plainText
import app.braid.mobile.domain.chat.polishInline
import app.braid.mobile.domain.chat.polishParagraph
import app.braid.mobile.domain.chat.shortUrl
import app.braid.mobile.domain.markdown.MarkdownBlock
import app.braid.mobile.domain.markdown.MarkdownInline
import app.braid.mobile.domain.markdown.parseMarkdown

/**
 * A resposta do agente (canvas "Resposta do Hermes — formatação", opção A): o texto dele lido como markdown, com termos
 * técnicos em código, endereços encurtados e os passos numerados entre fios. Quando ele pede para dizer uma entre
 * alternativas, elas viram botões: tocar envia a alternativa como a próxima mensagem. Sem [onChoose] os botões ficam
 * desligados (resposta antiga ou pedido em andamento). HTML cru nunca é interpretado e imagens viram o texto alternativo.
 */
@Composable
fun ChatAnswer(
    text: String,
    onChoose: ((String) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val blocks = remember(text) { parseMarkdown(text) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Blocks(blocks, onChoose)
    }
}

@Composable
private fun Blocks(
    blocks: List<MarkdownBlock>,
    onChoose: ((String) -> Unit)?,
) {
    blocks.forEachIndexed { index, block ->
        when (block) {
            is MarkdownBlock.Paragraph ->
                Paragraph(
                    block,
                    nextIsList = blocks.getOrNull(index + 1) is MarkdownBlock.ListBlock,
                    onChoose = onChoose,
                )
            is MarkdownBlock.Heading -> SectionLabel(plainText(block.content))
            is MarkdownBlock.Code -> CodeBlock(block.text)
            is MarkdownBlock.ListBlock -> ListBlock(block, onChoose)
            is MarkdownBlock.Quote -> Quote(block, onChoose)
            is MarkdownBlock.Table -> TableBlock(block)
            MarkdownBlock.Rule -> Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
        }
    }
}

private val BodyStyle = TextStyle(fontSize = 15.sp, lineHeight = 24.sp)

@Composable
private fun Paragraph(
    block: MarkdownBlock.Paragraph,
    nextIsList: Boolean,
    onChoose: ((String) -> Unit)?,
) {
    when (val polished = remember(block, nextIsList) { polishParagraph(block.content, nextIsList) }) {
        is PolishedParagraph.Label -> SectionLabel(polished.text)
        is PolishedParagraph.Body -> {
            Text(text = inlineText(polished.children), style = BodyStyle, color = MaterialTheme.colorScheme.onBackground)
            if (polished.choices.isNotEmpty()) Choices(polished.choices, onChoose)
        }
    }
}

/** O rótulo de uma lista ("Os passos") e os títulos que o agente escrever: mono, em caixa alta, sobre um fio. */
@Composable
private fun SectionLabel(text: String) {
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        Text(
            text = text.uppercase(),
            modifier = Modifier.padding(bottom = 8.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.1.em,
        )
        Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
    }
}

/** As alternativas que o agente pede para dizer: tocar envia a resposta. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Choices(
    choices: List<String>,
    onChoose: ((String) -> Unit)?,
) {
    val scheme = MaterialTheme.colorScheme
    FlowRow(
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Escolha uma resposta" },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        maxItemsInEachRow = 2,
    ) {
        for (choice in choices) {
            val enabled = onChoose != null
            Box(
                modifier =
                    Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .border(1.dp, scheme.outline, RoundedCornerShape(8.dp))
                        .clickable(enabled = enabled, role = Role.Button) { onChoose?.invoke(choice) }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    text = choiceLabel(choice),
                    color = if (enabled) scheme.onBackground else scheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun CodeBlock(text: String) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.secondary, RoundedCornerShape(5.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(text = text, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp, color = MaterialTheme.colorScheme.onBackground)
    }
}

@Composable
private fun Quote(
    block: MarkdownBlock.Quote,
    onChoose: ((String) -> Unit)?,
) {
    val line = MaterialTheme.colorScheme.outline
    Row(Modifier.height(IntrinsicSize.Min)) {
        Box(Modifier.width(1.dp).fillMaxHeight().background(line))
        Column(Modifier.padding(start = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { Blocks(block.blocks, onChoose) }
    }
}

/** Passos numerados e marcadores, separados por fios; o aninhado recua. */
@Composable
private fun ListBlock(
    block: MarkdownBlock.ListBlock,
    onChoose: ((String) -> Unit)?,
) {
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth()) {
        block.items.forEachIndexed { index, item ->
            Column {
                Row(Modifier.fillMaxWidth().padding(vertical = if (block.ordered) 12.dp else 6.dp)) {
                    Box(Modifier.width(30.dp)) {
                        when {
                            item.checked != null ->
                                Text(
                                    text = if (item.checked == true) "☑" else "☐",
                                    modifier = Modifier.semantics { contentDescription = if (item.checked == true) "Feito" else "A fazer" },
                                    color = braidTokens().brand,
                                    fontSize = 15.sp,
                                    lineHeight = 24.sp,
                                )
                            block.ordered ->
                                Text(
                                    text = (block.start + index).toString(),
                                    color = scheme.outlineVariant,
                                    fontFamily = BraidMonoFont,
                                    fontSize = 12.sp,
                                    lineHeight = 24.sp,
                                )
                            else ->
                                Box(
                                    Modifier
                                        .padding(start = 4.dp, top = 12.dp)
                                        .width(8.dp)
                                        .height(1.dp)
                                        .background(scheme.outlineVariant),
                                )
                        }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) { Blocks(item.blocks, onChoose) }
                }
                if (block.ordered && index < block.items.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
            }
        }
    }
}

private val CellWidth = 112.dp

@Composable
private fun TableBlock(block: MarkdownBlock.Table) {
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
        Row {
            for (cell in block.header) {
                Text(
                    text = inlineText(polishInline(cell)),
                    modifier = Modifier.width(CellWidth).padding(vertical = 6.dp, horizontal = 0.dp),
                    color = scheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        Box(Modifier.width(CellWidth * block.header.size).height(1.dp).background(scheme.outline))
        for (row in block.rows) {
            Row {
                for (cell in row) {
                    Text(
                        text = inlineText(polishInline(cell)),
                        modifier = Modifier.width(CellWidth).padding(vertical = 6.dp),
                        color = scheme.onBackground,
                        fontSize = 13.sp,
                        lineHeight = 20.sp,
                    )
                }
            }
            Box(Modifier.width(CellWidth * block.header.size).height(1.dp).background(scheme.outline))
        }
    }
}

/** O texto em linha como [AnnotatedString]: código em mono, endereços encurtados e links que abrem no navegador. */
@Composable
private fun inlineText(children: List<MarkdownInline>): AnnotatedString {
    val scheme = MaterialTheme.colorScheme
    val link = SpanStyle(color = scheme.tertiary, textDecoration = TextDecoration.Underline)
    val code = SpanStyle(fontFamily = BraidMonoFont, fontSize = 12.5.sp, background = scheme.secondary)
    return remember(children, scheme) {
        buildAnnotatedString { appendInline(children, link, code) }
    }
}

private fun AnnotatedString.Builder.appendInline(
    children: List<MarkdownInline>,
    link: SpanStyle,
    code: SpanStyle,
) {
    for (child in children) {
        when (child) {
            is MarkdownInline.Text -> append(child.text)
            is MarkdownInline.Code -> withStyle(code) { append(child.text) }
            is MarkdownInline.Strong -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { appendInline(child.content, link, code) }
            is MarkdownInline.Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { appendInline(child.content, link, code) }
            is MarkdownInline.Strike ->
                withStyle(
                    SpanStyle(textDecoration = TextDecoration.LineThrough),
                ) { appendInline(child.content, link, code) }
            MarkdownInline.LineBreak -> append("\n")
            is MarkdownInline.Link -> {
                val bare =
                    child.content.singleOrNull()?.let { it is MarkdownInline.Text && it.text.trimEnd('/') == child.href.trimEnd('/') } ==
                        true
                withLink(LinkAnnotation.Url(child.href, TextLinkStyles(link))) {
                    if (bare) {
                        withStyle(SpanStyle(fontFamily = BraidMonoFont, fontSize = 12.5.sp)) { append(shortUrl(child.href)) }
                    } else {
                        appendInline(child.content, link, code)
                    }
                }
            }
        }
    }
}
