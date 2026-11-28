package app.braid.mobile.ui.documents

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.documentTokens
import app.braid.mobile.domain.markdown.SUMMARY_ROWS_SHOWN
import app.braid.mobile.domain.markdown.SUMMARY_TEXT_FOLD
import app.braid.mobile.domain.markdown.SummaryCard
import app.braid.mobile.domain.markdown.SummaryDocument
import app.braid.mobile.domain.markdown.SummaryDue
import app.braid.mobile.domain.markdown.SummaryDueTone
import app.braid.mobile.domain.markdown.SummaryLink
import app.braid.mobile.domain.markdown.SummaryRow
import app.braid.mobile.domain.markdown.SummaryScore
import app.braid.mobile.domain.markdown.SummarySection
import app.braid.mobile.domain.markdown.SummarySender
import app.braid.mobile.domain.markdown.VideoLink
import app.braid.mobile.domain.markdown.internalAnchorOf
import app.braid.mobile.domain.markdown.youtubeVideoOf
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

private const val READ_TRANSCRIPT = "Ler a transcrição"
private const val FOLD_TRANSCRIPT = "Recolher a transcrição"
private const val SHOW_LESS = "Mostrar menos"
private const val SHOW_ALL_TEXT = "Mostrar tudo"
private const val OPENED = "Aberto"
private const val CLOSED = "Fechado"
private const val TOUCH_TARGET = 44
private const val CLIPPED_TEXT_HEIGHT = 168
private const val SECONDS_PER_MINUTE = 60f

/** A menor fatia que um intervalo ocupa na linha do vídeo, para um trecho curto não sumir. */
private const val MIN_PEAK_SHARE = 0.015f

/**
 * O texto de notícias, de resumo de e-mail e de transcrição em fichas, como o `SummaryCards` do web: os números no
 * topo, a abertura, e cada grupo do markdown como fichas (um título por ficha), linhas (uma lista) ou texto. Cartão é
 * uma linha de 1 dp, sem sombra; a única ação preenchida da tela é a primeira ação da primeira ficha ou "Ler a
 * transcrição". A transcrição fica recolhida atrás desse botão; a linha que aponta um trecho (`#t-125`) a abre e rola
 * até ele.
 */
@Composable
fun SummaryCardsView(
    document: SummaryDocument,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var transcriptOpen by rememberSaveable { mutableStateOf(false) }
    var pending by remember { mutableStateOf<String?>(null) }
    val hasTranscript = remember(document) { document.sections.any { it is SummarySection.Transcript } }
    val allCards = remember(document) { document.sections.flatMap { (it as? SummarySection.Cards)?.cards ?: emptyList() } }
    // Uma ação preenchida por tela: "Ler a transcrição" quando há transcrição; senão, a primeira ação da primeira ficha.
    val filledCard = remember(allCards, hasTranscript) { if (hasTranscript) null else allCards.firstOrNull { it.actions.isNotEmpty() } }
    // Só a primeira notícia abre em letra grande.
    val leadCard = remember(allCards) { allCards.firstOrNull()?.takeIf { it.kicker != null } }
    val open: (String) -> Unit = { href ->
        if (internalAnchorOf(href) == null) {
            openOutside(context, href)
        } else if (hasTranscript) {
            transcriptOpen = true
            pending = href
        }
    }
    val video =
        remember(document.source) {
            document.source?.let { source ->
                youtubeVideoOf(source.href)?.let { VideoLink(source.href, it, source.label) }
            }
        }
    val hasTop = document.source != null || document.score.isNotEmpty() || document.lead.isNotEmpty()

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        document.source?.let { source ->
            if (video != null) {
                VideoBlock(video, source.byline)
            } else {
                SourceLine(source.label, source.byline, onOpen = { open(source.href) })
            }
        }
        if (document.score.isNotEmpty()) ScoreCard(document.score)
        if (document.lead.isNotEmpty()) CardBox { MarkdownView(document.lead, Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) }

        document.sections.forEachIndexed { index, section ->
            val block = if (hasTop || index > 0) Modifier.padding(top = 12.dp) else Modifier
            when (section) {
                is SummarySection.Cards ->
                    Column(block, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        section.title?.let { SectionLabel(it, section.cards.size) }
                        if (section.intro.isNotEmpty()) MarkdownView(section.intro)
                        section.cards.forEach { card ->
                            SummaryCardBox(card, lead = card === leadCard, filled = card === filledCard, onOpen = open)
                        }
                    }
                is SummarySection.Rows -> RowsGroup(section, document.durationSeconds, onOpen = open, modifier = block)
                is SummarySection.Text -> TextGroup(section, block)
                is SummarySection.Transcript ->
                    Column(block, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (transcriptOpen) {
                            Column {
                                SectionLabel(section.title)
                                CardBox {
                                    MarkdownView(
                                        section.body,
                                        Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                                        follow = pending,
                                        onFollowed = { pending = null },
                                    )
                                }
                            }
                        }
                        WideButton(
                            if (transcriptOpen) FOLD_TRANSCRIPT else READ_TRANSCRIPT,
                            filled = !transcriptOpen,
                            open = transcriptOpen,
                            onClick = { transcriptOpen = !transcriptOpen },
                        )
                    }
            }
        }
    }
}

/** O cartão das fichas: a linha de 1 dp no raio dos cartões, sobre o plano. */
@Composable
private fun CardBox(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val shape = MaterialTheme.shapes.large
    Column(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, MaterialTheme.colorScheme.outline, shape),
    ) { content() }
}

@Composable
private fun Hairline() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
}

/** A linha da fonte quando ela não é um vídeo: o site, que abre fora do app, e o autor. */
@Composable
private fun SourceLine(
    label: String,
    byline: String?,
    onOpen: () -> Unit,
) {
    Text(
        "Fonte: $label${byline?.let { " · $it" } ?: ""}",
        Modifier
            .heightIn(
                min = TOUCH_TARGET.dp,
            ).clickable(role = Role.Button, onClickLabel = "Abrir a fonte", onClick = onOpen)
            .padding(vertical = 13.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )
}

/** Os números do topo: até três, na serifa, com o que cada um conta embaixo. */
@Composable
private fun ScoreCard(score: List<SummaryScore>) {
    CardBox {
        Row(Modifier.height(IntrinsicSize.Min)) {
            score.forEachIndexed { index, entry ->
                if (index > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(MaterialTheme.colorScheme.outline))
                Column(
                    Modifier
                        .weight(1f)
                        .padding(start = 14.dp, top = 14.dp, end = 14.dp, bottom = 12.dp)
                        .semantics(mergeDescendants = true) { contentDescription = "${entry.value} ${entry.label}" },
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        "${entry.value}",
                        color = MaterialTheme.colorScheme.onBackground,
                        fontFamily = BraidDisplayFont,
                        fontSize = 28.sp,
                        lineHeight = 28.sp,
                    )
                    Text(entry.label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
                }
            }
        }
    }
}

/** Uma ficha: a editoria, o remetente, o título e o texto; no pé, o prazo e as fontes de um lado e as ações do outro. */
@Composable
private fun SummaryCardBox(
    card: SummaryCard,
    lead: Boolean,
    filled: Boolean,
    onOpen: (String) -> Unit,
) {
    val ink = MaterialTheme.colorScheme.onBackground
    CardBox {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            card.kicker?.let {
                Text(
                    it.uppercase(),
                    color = documentTokens().faint,
                    fontFamily = BraidMonoFont,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    letterSpacing = 0.08.em,
                )
            }
            card.from?.let { SenderRow(it) }
            if (lead) {
                Text(
                    card.title,
                    Modifier.semantics { heading() },
                    color = ink,
                    fontFamily = BraidDisplayFont,
                    fontWeight = FontWeight.Medium,
                    fontSize = 24.sp,
                    lineHeight = 30.sp,
                    letterSpacing = (-0.01).em,
                )
            } else {
                val large = card.kicker != null
                Text(
                    card.title,
                    Modifier.semantics { heading() },
                    color = ink,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = if (large) 17.sp else 16.sp,
                    lineHeight = if (large) 23.sp else 22.sp,
                )
            }
            if (card.body.isNotEmpty()) MarkdownView(card.body)
        }
        if (card.due != null || card.sources.isNotEmpty() || card.actions.isNotEmpty()) CardFoot(card, filled, onOpen)
    }
}

@Composable
private fun SenderRow(sender: SummarySender) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (sender.initials.isNotEmpty()) {
            Box(
                Modifier.size(32.dp).background(MaterialTheme.colorScheme.secondary, CircleShape).clearAndSetSemantics {
                },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    sender.initials,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                    lineHeight = 13.sp,
                )
            }
        }
        Text(
            sender.name,
            Modifier.weight(1f),
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold,
            fontSize = 15.sp,
            lineHeight = 20.sp,
        )
        sender.detail?.let { Text(it, color = documentTokens().faint, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 16.sp) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CardFoot(
    card: SummaryCard,
    filled: Boolean,
    onOpen: (String) -> Unit,
) {
    // Sem ação na ficha, o botão do pé abre a primeira fonte que tem endereço.
    val opens = if (card.actions.isEmpty()) card.sources.firstNotNullOfOrNull { it.href } else null
    Hairline()
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(start = 16.dp, top = 6.dp, end = 6.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FlowRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.Center) {
            card.due?.let { DueLabel(it) }
            card.sources.forEach { SourceChip(it, onOpen) }
        }
        if (card.actions.isNotEmpty()) {
            FlowRow(
                Modifier.widthIn(max = 250.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                card.actions.forEachIndexed { index, action ->
                    PillButton(action.label, filled = filled && index == 0, onClick = { onOpen(action.href) })
                }
            }
        }
        if (opens != null) {
            Box(
                Modifier
                    .size(TOUCH_TARGET.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = { onOpen(opens) })
                    .semantics { contentDescription = "Abrir a matéria: ${card.title}" },
                contentAlignment = Alignment.Center,
            ) { SvgIcon(BraidIcons.arrowUpRight, size = 18.dp, color = MaterialTheme.colorScheme.onSurfaceVariant, strokeWidth = 1.75f) }
        }
    }
}

/** O prazo: o relógio e o texto, no tom que o texto pede. O tom nunca vai sozinho: quem diz o prazo é o texto. */
@Composable
private fun DueLabel(due: SummaryDue) {
    val color =
        when (due.tone) {
            SummaryDueTone.Late -> MaterialTheme.colorScheme.error
            SummaryDueTone.Soon -> braidTokens().warning
            SummaryDueTone.Calm -> MaterialTheme.colorScheme.onSurfaceVariant
        }
    Row(
        Modifier.heightIn(min = TOUCH_TARGET.dp).semantics(mergeDescendants = true) { contentDescription = "Prazo: ${due.text}" },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SvgIcon(BraidIcons.clock, size = 16.dp, color = color, strokeWidth = 1.75f)
        Text(due.text, color = color, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp)
    }
}

/** A etiqueta de uma fonte; com endereço, abre a fonte fora do app. */
@Composable
private fun SourceChip(
    link: SummaryLink,
    onOpen: (String) -> Unit,
) {
    val href = link.href
    Box(
        Modifier.heightIn(min = TOUCH_TARGET.dp).then(
            if (href !=
                null
            ) {
                Modifier.clickable(role = Role.Button, onClickLabel = "Abrir a fonte", onClick = { onOpen(href) })
            } else {
                Modifier
            },
        ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            link.label,
            Modifier
                .background(
                    MaterialTheme.colorScheme.secondary,
                    MaterialTheme.shapes.extraSmall,
                ).padding(horizontal = 8.dp, vertical = 4.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            lineHeight = 16.sp,
        )
    }
}

/** O botão em pílula do pé da ficha: contornado, ou preenchido quando é a ação da tela. */
@Composable
private fun PillButton(
    label: String,
    filled: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .heightIn(min = TOUCH_TARGET.dp)
            .clip(CircleShape)
            .then(
                if (filled) Modifier.background(scheme.primary, CircleShape) else Modifier.border(1.dp, scheme.outlineVariant, CircleShape),
            ).clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (filled) scheme.onPrimary else scheme.onBackground,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            lineHeight = 18.sp,
        )
    }
}

/** O botão largo da transcrição: preenchido para ler, contornado para recolher. */
@Composable
private fun WideButton(
    label: String,
    filled: Boolean,
    open: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = TOUCH_TARGET.dp)
            .clip(CircleShape)
            .then(
                if (filled) Modifier.background(scheme.primary, CircleShape) else Modifier.border(1.dp, scheme.outlineVariant, CircleShape),
            ).clickable(role = Role.Button, onClick = onClick)
            .semantics { stateDescription = if (open) OPENED else CLOSED }
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (filled) scheme.onPrimary else scheme.onBackground,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            lineHeight = 18.sp,
        )
    }
}

/** O botão que estende e recolhe o que não coube: as linhas de uma lista ou o texto de um grupo. */
@Composable
private fun Fold(
    open: Boolean,
    more: String,
    onToggle: () -> Unit,
) {
    Hairline()
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(role = Role.Button, onClick = onToggle)
            .semantics { stateDescription = if (open) OPENED else CLOSED }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (open) SHOW_LESS else more,
            Modifier.weight(1f),
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        SvgIcon(
            BraidIcons.chevronDown,
            Modifier.rotate(if (open) 180f else 0f),
            size = 18.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            strokeWidth = 1.75f,
        )
    }
}

/** Um grupo que é uma lista: o rótulo com a contagem e um cartão de linhas; passou de cinco, o resto espera o pedido. */
@Composable
private fun RowsGroup(
    section: SummarySection.Rows,
    durationSeconds: Int?,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var all by rememberSaveable(section.title) { mutableStateOf(false) }
    val hidden = section.rows.size - SUMMARY_ROWS_SHOWN
    val rows = if (all || hidden <= 0) section.rows else section.rows.take(SUMMARY_ROWS_SHOWN)
    Column(modifier) {
        SectionLabel(section.title, section.rows.size)
        CardBox {
            if (section.peaks && durationSeconds != null) PeakTrack(section.rows, durationSeconds)
            rows.forEachIndexed { index, row ->
                if (index > 0) Hairline()
                RowLine(row, onOpen)
            }
            if (hidden > 0) Fold(all, "Mostrar todas (${section.rows.size})", onToggle = { all = !all })
        }
    }
}

/** Uma linha: a minutagem em mono, o título e o texto de apoio. Com link, a linha inteira o abre. */
@Composable
private fun RowLine(
    row: SummaryRow,
    onOpen: (String) -> Unit,
) {
    val href = row.href
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .then(if (href != null) Modifier.clickable(role = Role.Button, onClick = { onOpen(href) }) else Modifier)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        row.time?.let {
            Text(
                it,
                Modifier
                    .widthIn(
                        min = 48.dp,
                    ).background(
                        MaterialTheme.colorScheme.secondary,
                        MaterialTheme.shapes.extraSmall,
                    ).padding(horizontal = 6.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                textAlign = TextAlign.Center,
            )
        }
        Column(Modifier.weight(1f)) {
            row.title?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                )
            }
            if (row.text.isNotEmpty()) {
                if (row.title == null) {
                    Text(row.text, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, lineHeight = 22.sp)
                } else {
                    Text(row.text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 18.sp)
                }
            }
        }
    }
}

/** Os trechos mais assistidos na linha do vídeo: cada intervalo no lugar e no tamanho que ele tem. */
@Composable
private fun PeakTrack(
    rows: List<SummaryRow>,
    durationSeconds: Int,
) {
    val ranges = remember(rows) { rows.mapNotNull { it.range } }
    val times = remember(rows) { rows.mapNotNull { row -> row.time.takeIf { row.range != null } }.joinToString(", ") }
    val rail = MaterialTheme.colorScheme.secondary
    val ink = MaterialTheme.colorScheme.onBackground
    val faint = documentTokens().faint
    Column(Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Canvas(Modifier.fillMaxWidth().height(8.dp).semantics { contentDescription = "Onde ficam no vídeo: $times" }) {
            val radius = CornerRadius(size.height / 2)
            drawRoundRect(rail, cornerRadius = radius)
            ranges.forEach { range ->
                val left = min(1f, range.start.toFloat() / durationSeconds)
                val share = max(MIN_PEAK_SHARE, min(1f - left, (range.end - range.start).toFloat() / durationSeconds))
                drawRoundRect(ink, Offset(left * size.width, 0f), Size(share * size.width, size.height), radius)
            }
        }
        Row(Modifier.fillMaxWidth().clearAndSetSemantics { }, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("00:00", color = faint, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 16.sp)
            Text(
                "${max(1, ceil(durationSeconds / SECONDS_PER_MINUTE).toInt())} min",
                color = faint,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
    }
}

/** Um grupo de texto: o rótulo e um cartão com o markdown; um texto longo abre recolhido. */
@Composable
private fun TextGroup(
    section: SummarySection.Text,
    modifier: Modifier = Modifier,
) {
    val long = section.body.length > SUMMARY_TEXT_FOLD
    var all by rememberSaveable(section.title) { mutableStateOf(false) }
    Column(modifier) {
        SectionLabel(section.title)
        CardBox {
            Box(if (long && !all) Modifier.heightIn(max = CLIPPED_TEXT_HEIGHT.dp).clipToBounds() else Modifier) {
                MarkdownView(section.body, Modifier.padding(horizontal = 16.dp, vertical = 14.dp))
            }
            if (long) Fold(all, SHOW_ALL_TEXT, onToggle = { all = !all })
        }
    }
}
