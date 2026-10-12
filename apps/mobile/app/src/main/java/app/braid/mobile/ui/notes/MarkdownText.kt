@file:Suppress("ktlint:standard:function-naming")

package app.braid.mobile.ui.notes

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckBox
import androidx.compose.material.icons.outlined.CheckBoxOutlineBlank
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
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
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidNoteExcerptStyle
import app.braid.mobile.domain.notes.MdBlock
import app.braid.mobile.domain.notes.MdInline
import app.braid.mobile.domain.notes.parseMarkdown
import androidx.compose.ui.text.LinkAnnotation as TextLinkAnnotation

/** O markdown de uma nota, igual ao `MarkdownView` do web: texto em cinza, ênfase e títulos em cor cheia. */
@Composable
internal fun MarkdownText(
    source: String,
    modifier: Modifier = Modifier,
) {
    val blocks = remember(source) { parseMarkdown(source) }
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        blocks.forEach { MarkdownBlock(it) }
    }
}

@Composable
private fun MarkdownBlock(block: MdBlock) {
    val body = BraidNoteExcerptStyle
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val strong = MaterialTheme.colorScheme.onSurface
    val outline = MaterialTheme.colorScheme.outline
    when (block) {
        is MdBlock.Paragraph -> Text(inlineText(block.inlines, strong), style = body, color = muted)
        is MdBlock.Heading -> {
            val style =
                when (block.level) {
                    1 -> TextStyle(fontFamily = BraidDisplayFont, fontWeight = FontWeight.Normal, fontSize = 19.sp, lineHeight = 26.sp)
                    2 -> MaterialTheme.typography.titleSmall.copy(fontSize = 15.sp)
                    else -> MaterialTheme.typography.titleSmall.copy(fontSize = 13.sp)
                }
            Text(inlineText(block.inlines, strong), style = style, color = strong)
        }
        is MdBlock.ListBlock ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                block.items.forEach { item ->
                    Row(
                        modifier = Modifier.padding(start = (item.depth * 18).dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        when {
                            item.checked != null ->
                                Icon(
                                    imageVector = if (item.checked) Icons.Outlined.CheckBox else Icons.Outlined.CheckBoxOutlineBlank,
                                    contentDescription = if (item.checked) "Feito" else "A fazer",
                                    modifier = Modifier.padding(top = 3.dp).size(17.dp),
                                    tint = if (item.checked) strong else muted,
                                )
                            item.number != null -> Text("${item.number}.", style = body, color = muted)
                            else ->
                                Box(
                                    Modifier
                                        .padding(top = 9.dp, start = 4.dp, end = 2.dp)
                                        .size(5.dp)
                                        .clip(CircleShape)
                                        .background(muted),
                                )
                        }
                        Text(inlineText(item.inlines, strong), style = body, color = muted)
                    }
                }
            }
        is MdBlock.Quote ->
            Row(modifier = Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.width(2.dp).fillMaxHeight().background(outline))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    block.blocks.forEach { MarkdownBlock(it) }
                }
            }
        is MdBlock.CodeBlock ->
            Surface(shape = MaterialTheme.shapes.medium, color = strong.copy(alpha = 0.07f)) {
                Text(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(12.dp),
                    text = block.text,
                    style = TextStyle(fontFamily = BraidMonoFont, fontSize = 12.5.sp, lineHeight = 19.sp),
                    color = strong,
                    softWrap = false,
                )
            }
        MdBlock.Rule -> HorizontalDivider(color = outline)
    }
}

/** Os trechos inline em um `AnnotatedString`: negrito, itálico, riscado, código e links. */
@Composable
private fun inlineText(
    inlines: List<MdInline>,
    strong: Color,
): AnnotatedString {
    val link = MaterialTheme.colorScheme.onSurface
    return remember(inlines, strong, link) {
        buildAnnotatedString { appendInlines(inlines, strong, link) }
    }
}

private fun codeStyle(strong: Color) =
    SpanStyle(
        fontFamily = BraidMonoFont,
        fontSize = 12.5.sp,
        color = strong,
        background = strong.copy(alpha = 0.08f),
    )

private fun AnnotatedString.Builder.appendInlines(
    inlines: List<MdInline>,
    strong: Color,
    link: Color,
) {
    inlines.forEach { inline ->
        when (inline) {
            is MdInline.Text -> append(inline.text)
            is MdInline.Bold ->
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = strong)) { appendInlines(inline.children, strong, link) }
            is MdInline.Italic -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { appendInlines(inline.children, strong, link) }
            is MdInline.Strike ->
                withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { appendInlines(inline.children, strong, link) }
            is MdInline.Code ->
                withStyle(codeStyle(strong)) { append(inline.text) }
            is MdInline.Link ->
                withLink(
                    TextLinkAnnotation.Url(
                        inline.url,
                        TextLinkStyles(SpanStyle(color = link, textDecoration = TextDecoration.Underline)),
                    ),
                ) { appendInlines(inline.children, strong, link) }
        }
    }
}
