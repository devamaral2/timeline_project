package app.braid.mobile.ui.documents

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.network.thirdPartyImageLoader
import app.braid.mobile.domain.markdown.InlineRun
import app.braid.mobile.domain.markdown.MarkdownBlock
import app.braid.mobile.domain.markdown.MarkdownInline
import app.braid.mobile.domain.markdown.MarkdownListItem
import app.braid.mobile.domain.markdown.VideoLink
import app.braid.mobile.domain.markdown.internalAnchorOf
import app.braid.mobile.domain.markdown.parseMarkdown
import app.braid.mobile.domain.markdown.scrollTargetOf
import app.braid.mobile.domain.markdown.soleYouTubeLink
import app.braid.mobile.domain.markdown.splitPictures
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * O markdown de um artefato de texto, como o `MarkdownView` do web: títulos, listas, ênfase, código e links. O
 * `#` desce para o tamanho de seção, porque o título da tela é o nome do artefato; a caixa de tarefa é só leitura.
 */
@Composable
fun MarkdownView(
    source: String,
    modifier: Modifier = Modifier,
    /** Um link `#t-125` tocado fora deste leitor (a linha de uma ficha): o leitor rola até o trecho e avisa. */
    follow: String? = null,
    onFollowed: () -> Unit = {},
) {
    val blocks = remember(source) { parseMarkdown(source, images = true) }
    // As imagens do artefato aparecem todas juntas, quando a pessoa pede; o estado é desta leitura, não é guardado.
    var shown by remember { mutableStateOf(false) }
    val images = remember(shown) { ImagesState(shown) { shown = true } }
    // Os trechos com âncora (`{#t-125}`) sabem rolar até si; tocar num link `#t-125` pede a rolagem ao trecho do artefato.
    val scope = rememberCoroutineScope()
    val anchors = remember(blocks, scope) { Anchors(blocks, scope) }
    LaunchedEffect(follow, anchors) {
        if (follow == null) return@LaunchedEffect
        // O trecho pode ter acabado de entrar na tela: espera o desenho antes de rolar.
        withFrameNanos { }
        anchors.follow(follow)
        onFollowed()
    }
    CompositionLocalProvider(LocalImages provides images, LocalAnchors provides anchors) { MarkdownBlocks(blocks, modifier) }
}

/** Os trechos com âncora de um artefato e a rolagem até eles; a tela que rola (a do artefato) recebe o pedido. */
private class Anchors(
    private val blocks: List<MarkdownBlock>,
    private val scope: CoroutineScope,
) {
    private val requesters = mutableMapOf<String, BringIntoViewRequester>()

    fun requester(id: String): BringIntoViewRequester = requesters.getOrPut(id) { BringIntoViewRequester() }

    fun follow(href: String) {
        val id = scrollTargetOf(blocks, href) ?: return
        scope.launch { requester(id).bringIntoView() }
    }
}

private val LocalAnchors = staticCompositionLocalOf<Anchors?> { null }

/** Se as imagens do artefato já foram pedidas, e como pedi-las. */
private class ImagesState(
    val shown: Boolean,
    val show: () -> Unit,
)

private val LocalImages = staticCompositionLocalOf { ImagesState(shown = false) {} }

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
                is MarkdownBlock.Paragraph -> ParagraphBlock(block)
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

/** Um link do YouTube sozinho no parágrafo vira o cartão do vídeo; o resto é texto, com as imagens em linha própria. */
@Composable
private fun ParagraphBlock(block: MarkdownBlock.Paragraph) {
    val video = remember(block) { soleYouTubeLink(block) }
    if (video != null) {
        VideoBlock(video)
        return
    }
    val requester = block.anchor?.let { LocalAnchors.current?.requester(it) }
    InlineText(block.content, BODY, if (requester != null) Modifier.bringIntoViewRequester(requester) else Modifier)
}

@Composable
private fun InlineText(
    content: List<MarkdownInline>,
    style: TextStyle,
    modifier: Modifier = Modifier,
) {
    val runs = remember(content) { splitPictures(content) }
    val only = runs.singleOrNull()
    if (only is InlineRun.Text) {
        RunText(only.nodes, style, modifier)
    } else {
        Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            runs.forEach { run ->
                when (run) {
                    is InlineRun.Text -> RunText(run.nodes, style)
                    is InlineRun.Picture -> Picture(run)
                }
            }
        }
    }
}

@Composable
private fun RunText(
    content: List<MarkdownInline>,
    style: TextStyle,
    modifier: Modifier = Modifier,
) {
    val wash = MaterialTheme.colorScheme.onBackground.copy(alpha = WASH_ALPHA)
    val anchors = LocalAnchors.current
    val text = remember(content, wash, anchors) { annotated(content, wash, anchors) }
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
    anchors: Anchors?,
): AnnotatedString =
    buildAnnotatedString {
        fun append(nodes: List<MarkdownInline>) {
            for (node in nodes) {
                when (node) {
                    is MarkdownInline.Text -> append(node.text)
                    MarkdownInline.LineBreak -> append("\n")
                    // Só chega aqui a imagem dentro de negrito ou de um link com texto: fica o texto alternativo.
                    is MarkdownInline.Image -> append(node.alt)
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
                        } else if (anchors != null && internalAnchorOf(node.href) != null) {
                            // Um link `#t-125` rola até o trecho do mesmo artefato.
                            withLink(LinkAnnotation.Clickable("anchor", TextLinkStyles(style)) { anchors.follow(node.href) }) {
                                append(node.content)
                            }
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

private const val VIDEO_RADIUS = 10
private const val PLAY_BUTTON = 44

/**
 * O vídeo de um link do YouTube sozinho no parágrafo. No app não há player embutido nem miniatura: abrir o artefato
 * não faz requisição nenhuma, e "Assistir no YouTube" entrega o endereço original ao YouTube (ou ao navegador). Sob o
 * cartão fica o link, como no web.
 */
@Composable
internal fun VideoBlock(
    link: VideoLink,
    /** O canal do vídeo, quando quem chama o conhece: vai depois do link, na legenda. */
    byline: String? = null,
) {
    val context = LocalContext.current
    val ink = MaterialTheme.colorScheme.onBackground
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val shape = RoundedCornerShape(VIDEO_RADIUS.dp)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(VIDEO_ASPECT)
                .clip(shape)
                .background(ink.copy(alpha = WASH_ALPHA), shape)
                .border(0.5.dp, MaterialTheme.colorScheme.outline, shape)
                .clickable(role = Role.Button, onClickLabel = WATCH_ON_YOUTUBE) { openOutside(context, link.href) }
                .semantics { contentDescription = WATCH_ON_YOUTUBE },
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(PLAY_BUTTON.dp).background(ink, RoundedCornerShape(50)), contentAlignment = Alignment.Center) {
                    SvgIcon(BraidIcons.play, size = 18.dp, color = MaterialTheme.colorScheme.background)
                }
                Text(WATCH_ON_YOUTUBE, color = ink, style = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium))
            }
        }
        val caption =
            buildAnnotatedString {
                withLink(LinkAnnotation.Url(link.href, TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline)))) {
                    append(link.caption)
                }
                byline?.let { append(" · $it") }
            }
        Text(caption, color = muted, style = TextStyle(fontSize = 13.sp, lineHeight = 18.sp))
    }
}

private const val VIDEO_ASPECT = 16f / 9f
private const val WATCH_ON_YOUTUBE = "Assistir no YouTube"

internal fun openOutside(
    context: Context,
    href: String,
) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(href)))
    } catch (missing: ActivityNotFoundException) {
        // Sem app nem navegador para o endereço: não há para onde ir.
    }
}

private const val IMAGE_ALT_PLACEHOLDER = "Imagem"
private const val SHOW_IMAGES = "Mostrar imagens"

/**
 * Uma imagem do artefato. Até a pessoa pedir ela é só um botão com o texto alternativo, porque abrir um artefato não
 * pode disparar requisição a um servidor qualquer; pedida (qualquer botão libera todas), é buscada por um cliente sem
 * a sessão do app, sem `Referer` e sem cookies (`thirdPartyImageLoader`).
 */
@Composable
private fun Picture(run: InlineRun.Picture) {
    val images = LocalImages.current
    val alt = run.image.alt
    if (!images.shown) {
        ImagePlaceholder(alt, images.show)
        return
    }
    val context = LocalContext.current
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val shape = RoundedCornerShape(VIDEO_RADIUS.dp)
    val opens = run.href?.takeIf { opensOutside(it) }
    SubcomposeAsyncImage(
        model = run.image.src,
        imageLoader = thirdPartyImageLoader(context),
        contentDescription = alt.ifEmpty { null },
        contentScale = ContentScale.FillWidth,
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .then(if (opens != null) Modifier.clickable(role = Role.Button) { openOutside(context, opens) } else Modifier),
        loading = {
            Box(Modifier.fillMaxWidth().height(LOADING_HEIGHT).background(MaterialTheme.colorScheme.onBackground.copy(alpha = WASH_ALPHA)))
        },
        error = { Text(alt.ifEmpty { IMAGE_ALT_PLACEHOLDER }, color = muted, style = TextStyle(fontSize = 13.sp, lineHeight = 18.sp)) },
    )
}

private val LOADING_HEIGHT = 120.dp

@Composable
private fun ImagePlaceholder(
    alt: String,
    onShow: () -> Unit,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val line = MaterialTheme.colorScheme.outline
    val description = if (alt.isNotEmpty()) "$SHOW_IMAGES: $alt" else SHOW_IMAGES
    Row(
        Modifier
            .heightIn(min = 44.dp)
            .drawBehind {
                drawRoundRect(
                    line,
                    cornerRadius = CornerRadius(8.dp.toPx()),
                    style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
                )
            }.clip(RoundedCornerShape(8.dp))
            .clickable(role = Role.Button, onClick = onShow)
            .semantics { contentDescription = description }
            .padding(horizontal = 10.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SvgIcon(BraidIcons.image, size = 16.dp, color = muted, strokeWidth = 1.75f)
        Text(
            alt.ifEmpty { IMAGE_ALT_PLACEHOLDER },
            Modifier.weight(1f, fill = false),
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = TextStyle(fontSize = 13.sp, lineHeight = 18.sp),
        )
        Text(SHOW_IMAGES, color = muted, style = TextStyle(fontSize = 12.sp, lineHeight = 16.sp))
    }
}
