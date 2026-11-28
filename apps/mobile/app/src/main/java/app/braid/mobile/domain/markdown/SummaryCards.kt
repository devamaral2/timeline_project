package app.braid.mobile.domain.markdown

import app.braid.mobile.domain.artifact.ArtifactType
import java.text.Normalizer
import kotlin.math.ceil
import kotlin.math.max

/*
 * As fichas de um resumo (`docs/summary-cards.md`): o que a tela de notícias, de resumo de e-mail e de transcrição
 * desenha no lugar do texto corrido. O dado continua sendo o markdown do artefato; aqui ele é só lido. Um texto sem
 * título nenhum não vira ficha (`null`) e a tela mostra o markdown como sempre.
 *
 * É a cópia, linha a linha, de `apps/web/src/lib/notes/summary-cards.ts`, conferida pela fixture `summary-cards`.
 * O `\s` do JS cobre os espaços Unicode; aqui ele é `[\s\p{Z}]` (o Android recusa a flag `(?U)`).
 */

data class SummaryLink(
    val label: String,
    /** `null` quando a fonte veio só com o nome, ou com um endereço que não é `http(s)`. */
    val href: String?,
)

enum class SummaryDueTone(
    val code: String,
) {
    Late("late"),
    Soon("soon"),
    Calm("calm"),
}

data class SummarySender(
    val name: String,
    val detail: String?,
    val initials: String,
)

data class SummaryDue(
    val text: String,
    val tone: SummaryDueTone,
)

data class SummaryAction(
    val label: String,
    val href: String,
)

data class SummaryCard(
    val title: String,
    /** A editoria da notícia: o título do grupo em que ela está. */
    val kicker: String?,
    /** A linha `De: nome · detalhe`. */
    val from: SummarySender?,
    /** A linha `Prazo: texto`. */
    val due: SummaryDue?,
    /** As linhas `Fonte:` e `Fontes:`. */
    val sources: List<SummaryLink>,
    /** Os parágrafos feitos só de links: os botões do pé da ficha. */
    val actions: List<SummaryAction>,
    /** O resto, em markdown. */
    val body: String,
)

data class SummaryTimeRange(
    val start: Int,
    val end: Int,
)

data class SummaryRow(
    val title: String?,
    val text: String,
    /** A minutagem como o texto a traz: `12:40` ou `12:40–13:05`. */
    val time: String?,
    /** O link que abre a linha: externo (`http(s)`) ou um trecho do próprio texto (`#t-125`). */
    val href: String?,
    /** O intervalo, em segundos, quando a minutagem é um intervalo. */
    val range: SummaryTimeRange?,
)

sealed interface SummarySection {
    data class Cards(
        val title: String?,
        val intro: String,
        val cards: List<SummaryCard>,
    ) : SummarySection

    data class Rows(
        val title: String,
        val rows: List<SummaryRow>,
        val peaks: Boolean,
    ) : SummarySection

    data class Text(
        val title: String,
        val body: String,
    ) : SummarySection

    data class Transcript(
        val title: String,
        val body: String,
    ) : SummarySection
}

data class SummaryScore(
    val value: Int,
    val label: String,
)

data class SummarySource(
    val label: String,
    val href: String,
    val byline: String?,
)

data class SummaryDocument(
    /** A linha `Fonte: [site](endereço) · autor` que abre o texto. */
    val source: SummarySource?,
    /** O que vem antes do primeiro título, em markdown. */
    val lead: String,
    /** Os números do topo: nenhum ou de dois a três. */
    val score: List<SummaryScore>,
    /** Até onde vai o vídeo: o último trecho marcado ou o fim do último intervalo. */
    val durationSeconds: Int?,
    val sections: List<SummarySection>,
)

/** Quantas linhas de uma lista aparecem antes de "Mostrar todas". */
const val SUMMARY_ROWS_SHOWN = 5

/** A partir de quantos caracteres o texto de um grupo abre recolhido. */
const val SUMMARY_TEXT_FOLD = 700

/** Os tipos que saem em fichas: notícias, resumo de e-mail e transcrição. */
fun isSummaryCardsType(type: ArtifactType): Boolean =
    type == ArtifactType.News || type == ArtifactType.EmailSummary || type == ArtifactType.YoutubeTranscript

private const val WS = "\\s\\p{Z}\\uFEFF"
private const val LINK_PATTERN = "\\[((?:\\\\.|[^\\]\\\\])*)\\]\\(([^()$WS]+)\\)"
private const val TIME = "\\d{1,3}:\\d{2}(?::\\d{2})?"

private val HEADING = Regex("^ {0,3}(#{1,6})[ \\t]+(.*?)[ \\t]*#*[ \\t]*$")
private val FENCE = Regex("^ {0,3}(```|~~~)")
private val SOURCE_LINE = Regex("^Fonte: $LINK_PATTERN(?:[ \\t]*·[ \\t]*(.+))?$")
private val LIST_ITEM = Regex("^ {0,3}(?:[-*+]|\\d{1,9}[.)])[ \\t]+(.*)$")
private val CONTINUATION = Regex("^(?: {2,}|\\t)[^$WS]")
private val ANCHOR_MARK = Regex("^\\{#t-(\\d+)\\}")
private val FIELD =
    Regex("^(?:[-*+][ \\t]+)?(?:\\*\\*|__)?(De|Prazo|Fontes?)(?:\\*\\*|__)?[ \\t]*:(?:\\*\\*|__)?[ \\t]+(.+)$", RegexOption.IGNORE_CASE)
private val LINK = Regex(LINK_PATTERN)
private val TIME_ONLY = Regex("^$TIME$")
private val TIME_RANGE = Regex("^($TIME)[ \\t]*[–—-][ \\t]*($TIME)$")
private val ROW_LINK = Regex("^$LINK_PATTERN[ \\t]*(?:\\(($TIME)\\))?[ \\t]*(?:[:—–-][ \\t]*)?(.*)$")
private val ROW_STRONG = Regex("^\\*\\*(.+?)\\*\\*[ \\t]*(?:[:—–-][ \\t]*)?(.*)$")
private val ROW_CHECK = Regex("^\\[[ xX]\\][ \\t]+")
private val SPEAKER = Regex("\\*\\*([^*]+?):?\\*\\*")
private val WORD = Regex("[\\p{L}\\p{N}]+")
private val INTERNAL_ANCHOR = Regex("^#t-\\d+$")
private val REMOTE = Regex("^https?://", RegexOption.IGNORE_CASE)
private val MAILTO = Regex("^mailto:", RegexOption.IGNORE_CASE)
private val TRIM = Regex("^[$WS]+|[$WS]+$")
private val SPACES = Regex("[$WS]+")
private val ONLY_SEPARATORS = Regex("^[$WS·|]*$")
private val SOURCE_SEPARATOR = Regex("[ \\t]*[·,;|][ \\t]*")
private val INLINE_LINK = Regex("!?\\[((?:\\\\.|[^\\]\\\\])*)\\]\\([^()$WS]*\\)")
private val EMPHASIS = Regex("\\*\\*|__|~~|`")
private val ESCAPE = Regex("\\\\(.)")
private val ANGLE = Regex("<[^>]*>")
private val TRAILING_COLON = Regex("[ \\t]*:$")
private val MANY_BREAKS = Regex("\\n{3,}")
private val LINE_BREAK = Regex("\\r\\n?")
private val MARKS = Regex("\\p{M}")
private val LATE = Regex("atrasad|vencid|ontem")
private val SOON = Regex("hoje|agora")
private val TODAY = Regex("hoje", RegexOption.IGNORE_CASE)

private const val WORDS_PER_MINUTE = 200.0
private const val SECONDS_PER_MINUTE = 60

private data class Mark(
    val line: Int,
    val level: Int,
    val title: String,
)

/**
 * Como ler um artefato em fichas, ou `null` quando ele fica em markdown. Os três tipos de resumo são lidos como o que
 * são. A nota (`text`) só quando é a transcrição que a Leitura diária guarda: abre com a linha `Fonte:` de um vídeo do
 * YouTube e tem trechos marcados (`{#t-125}`). Enquanto a transcrição não chega, o documento do vídeo não tem trecho
 * nenhum e segue como nota.
 */
fun summaryCardsTypeOf(
    type: ArtifactType,
    markdown: String,
): ArtifactType? {
    if (isSummaryCardsType(type)) return type
    if (type != ArtifactType.Text) return null
    val lines = markdown.replace(LINE_BREAK, "\n").split("\n")
    val first = lines.firstOrNull { !isBlank(it) } ?: return null
    val source = SOURCE_LINE.find(jsTrim(first)) ?: return null
    if (youtubeVideoOf(source.groupValues[2]) == null) return null
    return ArtifactType.YoutubeTranscript.takeIf { lines.any { ANCHOR_MARK.containsMatchIn(it) } }
}

/** As fichas de um artefato pelo tipo e pelo texto dele, ou `null` quando ele fica em markdown. */
fun summaryCardsFor(
    type: ArtifactType,
    markdown: String,
): SummaryDocument? = summaryCardsTypeOf(type, markdown)?.let { summaryCardsOf(it, markdown) }

/** As fichas de um texto, ou `null` quando o tipo não as tem ou o texto não tem título nenhum. */
fun summaryCardsOf(
    type: ArtifactType,
    markdown: String,
): SummaryDocument? {
    if (!isSummaryCardsType(type)) return null
    val lines = markdown.replace(LINE_BREAK, "\n").split("\n").toMutableList()

    var source: SummarySource? = null
    val first = lines.indexOfFirst { !isBlank(it) }
    val sourceMatch = if (first >= 0) SOURCE_LINE.find(jsTrim(lines[first])) else null
    if (sourceMatch != null && isRemote(sourceMatch.groupValues[2])) {
        val byline = sourceMatch.groups[3]?.value
        source = SummarySource(plainInline(sourceMatch.groupValues[1]), sourceMatch.groupValues[2], byline?.let(::plainInline))
        repeat(first + 1) { lines.removeAt(0) }
    }

    var marks = headingsOf(lines)
    if (marks.isEmpty()) return null
    var top = marks.minOf { it.level }
    // Um título sozinho no topo é o nome do texto, não um grupo.
    val tops = marks.filter { it.level == top }
    val opening = lines.indexOfFirst { !isBlank(it) }
    if (tops.size == 1 && tops[0].line == opening && marks.size > 1) {
        repeat(opening + 1) { lines.removeAt(0) }
        marks = headingsOf(lines)
        top = marks.minOf { it.level }
    }

    val starts = marks.filter { it.level == top }
    val lead = joined(lines.subList(0, starts.firstOrNull()?.line ?: lines.size))
    val sections = mutableListOf<SummarySection>()
    starts.forEachIndexed { index, start ->
        val end = starts.getOrNull(index + 1)?.line ?: lines.size
        val inner = marks.filter { it.line > start.line && it.line < end }
        val section = sectionOf(type, start.title, lines, start.line + 1, end, inner) ?: return@forEachIndexed
        val previous = sections.lastOrNull()
        val merges =
            section is SummarySection.Cards &&
                section.title == null &&
                section.intro.isEmpty() &&
                previous is SummarySection.Cards &&
                previous.title == null
        if (merges) {
            sections[sections.lastIndex] =
                (previous as SummarySection.Cards).copy(cards = previous.cards + (section as SummarySection.Cards).cards)
        } else {
            sections += section
        }
    }
    if (sections.isEmpty()) return null

    val durationSeconds = durationOf(lines, sections)
    return SummaryDocument(source, lead, scoreOf(type, lead, sections, lines, durationSeconds), durationSeconds, sections)
}

private fun headingsOf(lines: List<String>): List<Mark> {
    val marks = mutableListOf<Mark>()
    var fenced = false
    lines.forEachIndexed { index, line ->
        if (FENCE.containsMatchIn(line)) {
            fenced = !fenced
            return@forEachIndexed
        }
        if (fenced) return@forEachIndexed
        val match = HEADING.find(line) ?: return@forEachIndexed
        val title = plainInline(match.groupValues[2])
        if (title.isNotEmpty()) marks += Mark(index, match.groupValues[1].length, title)
    }
    return marks
}

private fun sectionOf(
    type: ArtifactType,
    title: String,
    lines: List<String>,
    from: Int,
    to: Int,
    inner: List<Mark>,
): SummarySection? {
    if (inner.isNotEmpty()) {
        val level = inner.minOf { it.level }
        val starts = inner.filter { it.level == level }
        val cards =
            starts.mapIndexed { index, start ->
                cardOf(start.title, lines.subList(start.line + 1, starts.getOrNull(index + 1)?.line ?: to))
            }
        val intro = joined(lines.subList(from, starts.first().line))
        // Na notícia o grupo é a editoria: vai para dentro de cada ficha, no lugar do rótulo do grupo.
        if (type == ArtifactType.News) return SummarySection.Cards(null, intro, cards.map { it.copy(kicker = title) })
        return SummarySection.Cards(title, intro, cards)
    }
    val content = lines.subList(from, to)
    val body = joined(content)
    if (body.isEmpty()) return null
    if (content.any { ANCHOR_MARK.containsMatchIn(it) }) return SummarySection.Transcript(title, body)
    val rows = rowsOf(content)
    if (rows != null) return SummarySection.Rows(title, rows, rows.all { it.range != null })
    if (type == ArtifactType.YoutubeTranscript) return SummarySection.Text(title, body)
    return SummarySection.Cards(null, "", listOf(cardOf(title, content)))
}

/** A ficha de um título: as linhas `De:`, `Prazo:` e `Fontes:` e os parágrafos só de links saem do texto. */
private fun cardOf(
    title: String,
    content: List<String>,
): SummaryCard {
    var from: SummarySender? = null
    var due: SummaryDue? = null
    val sources = mutableListOf<SummaryLink>()
    val actions = mutableListOf<SummaryAction>()
    val kept = mutableListOf<String>()
    var fenced = false
    for (line in content) {
        if (FENCE.containsMatchIn(line)) fenced = !fenced
        val field = if (fenced) null else FIELD.find(jsTrim(line))
        val name = field?.groupValues?.get(1)?.lowercase() ?: ""
        val value = jsTrim(field?.groupValues?.get(2) ?: "")
        if (name == "de" && from == null) {
            from = senderOf(value)
        } else if (name == "prazo" && due == null) {
            val text = plainInline(value)
            due = SummaryDue(text, dueToneOf(text))
        } else if (name.startsWith("fonte")) {
            sources += sourcesOf(value)
        } else {
            kept += line
        }
    }

    // Um parágrafo feito só de links é a linha de ações da ficha.
    val body = mutableListOf<String>()
    val paragraph = mutableListOf<String>()

    fun flush() {
        if (paragraph.isEmpty()) return
        val found = actionsOf(paragraph.joinToString(" "))
        if (found != null) actions += found else body += paragraph
        paragraph.clear()
    }
    fenced = false
    for (line in kept) {
        if (FENCE.containsMatchIn(line)) {
            flush()
            fenced = !fenced
            body += line
        } else if (fenced) {
            body += line
        } else if (isBlank(line)) {
            flush()
            body += line
        } else {
            paragraph += line
        }
    }
    flush()
    return SummaryCard(title, null, from, due, sources, actions, joined(body))
}

private fun senderOf(value: String): SummarySender {
    val cut = value.indexOf(" · ")
    val name = plainInline((if (cut < 0) value else value.substring(0, cut)).replace(ANGLE, ""))
    val detail = if (cut < 0) "" else plainInline(value.substring(cut + 3))
    return SummarySender(name, detail.ifEmpty { null }, initialsOf(name))
}

/** As iniciais do remetente: a da primeira palavra e a da última. */
fun initialsOf(name: String): String {
    val words = WORD.findAll(name).map { it.value }.toList()
    val firstWord = words.firstOrNull() ?: return ""
    val lastWord = if (words.size > 1) words.last() else null
    return (firstLetter(firstWord) + (lastWord?.let(::firstLetter) ?: "")).uppercase()
}

private fun firstLetter(word: String): String = String(Character.toChars(word.codePointAt(0)))

/** O tom do prazo pelo que o texto diz: vencido, para hoje ou sem pressa. */
fun dueToneOf(text: String): SummaryDueTone {
    val folded = Normalizer.normalize(text, Normalizer.Form.NFD).replace(MARKS, "").lowercase()
    if (LATE.containsMatchIn(folded)) return SummaryDueTone.Late
    if (SOON.containsMatchIn(folded)) return SummaryDueTone.Soon
    return SummaryDueTone.Calm
}

private fun sourcesOf(value: String): List<SummaryLink> {
    val links = linksOf(value)
    if (links.isNotEmpty()) return links.map { SummaryLink(it.label, it.href.takeIf(::isRemote)) }
    return value
        .split(SOURCE_SEPARATOR)
        .map(::plainInline)
        .filter { it.isNotEmpty() }
        .map { SummaryLink(it, null) }
}

private fun actionsOf(paragraph: String): List<SummaryAction>? {
    val rest = paragraph.replace(LINK, "")
    if (!ONLY_SEPARATORS.containsMatchIn(rest)) return null
    val links = linksOf(paragraph).filter { isRemote(it.href) || MAILTO.containsMatchIn(it.href) }
    return links.ifEmpty { null }
}

private fun linksOf(text: String): List<SummaryAction> =
    LINK
        .findAll(text)
        .mapNotNull { match ->
            val label = plainInline(match.groupValues[1])
            if (label.isEmpty()) null else SummaryAction(label, match.groupValues[2])
        }.toList()

/** As linhas de um grupo que é só uma lista; `null` quando há outra coisa no meio. */
private fun rowsOf(content: List<String>): List<SummaryRow>? {
    val items = mutableListOf<String>()
    for (line in content) {
        if (isBlank(line)) continue
        val item = LIST_ITEM.find(line)
        if (item != null) {
            items += item.groupValues[1]
        } else if (CONTINUATION.containsMatchIn(line) && items.isNotEmpty()) {
            items[items.lastIndex] = "${items.last()} ${jsTrim(line)}"
        } else {
            return null
        }
    }
    return if (items.isEmpty()) null else items.map(::rowOf)
}

private fun rowOf(item: String): SummaryRow {
    val text = jsTrim(item.replace(ROW_CHECK, ""))
    val link = ROW_LINK.find(text)
    if (link != null) {
        val label = plainInline(link.groupValues[1])
        val target = link.groupValues[2]
        val href = target.takeIf { isRemote(it) || INTERNAL_ANCHOR.containsMatchIn(it) }
        val rest = plainInline(link.groupValues[4])
        val range = TIME_RANGE.find(label)
        if (range != null) {
            return SummaryRow(null, rest, label, href, SummaryTimeRange(secondsOf(range.groupValues[1]), secondsOf(range.groupValues[2])))
        }
        if (TIME_ONLY.containsMatchIn(label)) return SummaryRow(null, rest, label, href, null)
        return SummaryRow(label, rest, link.groups[3]?.value, href, null)
    }
    val strong = ROW_STRONG.find(text)
    if (strong != null) {
        return SummaryRow(
            plainInline(strong.groupValues[1]).replace(TRAILING_COLON, ""),
            plainInline(strong.groupValues[2]),
            null,
            null,
            null,
        )
    }
    return SummaryRow(null, plainInline(text), null, null, null)
}

/** `12:40` e `1:02:03` em segundos. */
fun secondsOf(time: String): Int = time.split(":").fold(0) { total, part -> total * SECONDS_PER_MINUTE + part.toInt() }

private fun durationOf(
    lines: List<String>,
    sections: List<SummarySection>,
): Int? {
    var last = 0
    for (line in lines) {
        val mark = ANCHOR_MARK.find(line) ?: continue
        last = max(last, mark.groupValues[1].toIntOrNull() ?: 0)
    }
    for (section in sections) {
        if (section !is SummarySection.Rows) continue
        for (row in section.rows) row.range?.let { last = max(last, it.end) }
    }
    return last.takeIf { it > 0 }
}

private fun scoreOf(
    type: ArtifactType,
    lead: String,
    sections: List<SummarySection>,
    lines: List<String>,
    durationSeconds: Int?,
): List<SummaryScore> {
    val score = mutableListOf<SummaryScore>()

    fun add(
        value: Int,
        one: String,
        many: String,
    ) {
        if (value > 0) score += SummaryScore(value, if (value == 1) one else many)
    }
    val cards = sections.flatMap { (it as? SummarySection.Cards)?.cards ?: emptyList() }

    when (type) {
        ArtifactType.EmailSummary -> {
            val counted =
                sections.mapNotNull { section ->
                    when (section) {
                        is SummarySection.Cards -> section.title to section.cards.size
                        is SummarySection.Rows -> section.title to section.rows.size
                        else -> null
                    }
                }
            add(counted.sumOf { it.second }, "e-mail", "e-mails")
            val titled = counted.filter { it.first != null }
            // Com um grupo só, o número dele repetiria o total.
            titled.getOrNull(0)?.takeIf { counted.size > 1 }?.let { (title, count) ->
                val label = (title ?: "").lowercase()
                add(count, label, label)
            }
            val today = cards.count { it.due?.tone == SummaryDueTone.Soon && TODAY.containsMatchIn(it.due.text) }
            val due = cards.count { it.due != null }
            if (today > 0) {
                add(today, "vence hoje", "vencem hoje")
            } else if (due > 0) {
                add(due, "com prazo", "com prazo")
            } else {
                titled.getOrNull(1)?.let { (title, count) ->
                    val label = (title ?: "").lowercase()
                    add(count, label, label)
                }
            }
        }
        ArtifactType.News -> {
            add(cards.size, "assunto", "assuntos")
            add(cards.flatMap { card -> card.sources.map { it.label.lowercase() } }.toSet().size, "fonte", "fontes")
            val text = (listOf(lead) + cards.flatMap { listOf(it.title, it.body) }).joinToString(" ")
            val words = WORD.findAll(text).count()
            if (cards.isNotEmpty()) add(max(1, ceil(words / WORDS_PER_MINUTE).toInt()), "min de leitura", "min de leitura")
        }
        else -> {
            if (durationSeconds != null) add(max(1, ceil(durationSeconds / SECONDS_PER_MINUTE.toDouble()).toInt()), "minuto", "minutos")
            val speakers = mutableSetOf<String>()
            for (line in lines) {
                if (!ANCHOR_MARK.containsMatchIn(line)) continue
                val name =
                    SPEAKER
                        .find(line)
                        ?.groupValues
                        ?.get(1)
                        ?.let(::jsTrim)
                        ?.lowercase()
                if (!name.isNullOrEmpty()) speakers += name
            }
            add(speakers.size, "pessoa", "pessoas")
            val parts = sections.firstOrNull { it is SummarySection.Rows && !it.peaks } as? SummarySection.Rows
            if (parts != null) add(parts.rows.size, "parte", "partes")
        }
    }
    return if (score.size >= 2) score else emptyList()
}

private fun isRemote(href: String): Boolean = REMOTE.containsMatchIn(href)

/** O texto de um trecho de markdown de uma linha: sem link, ênfase nem crase, com os espaços de sobra fora. */
fun plainInline(text: String): String =
    jsTrim(
        text
            .replace(INLINE_LINK, "\$1")
            .replace(EMPHASIS, "")
            .replace("*", "")
            .replace(ESCAPE, "\$1")
            .replace(SPACES, " "),
    )

private fun joined(lines: List<String>): String = jsTrim(lines.joinToString("\n").replace(MANY_BREAKS, "\n\n"))

/** O `trim()` do JS: tira os espaços Unicode e o BOM das pontas. */
private fun jsTrim(text: String): String = text.replace(TRIM, "")

private fun isBlank(line: String): Boolean = jsTrim(line).isEmpty()
