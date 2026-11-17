package app.braid.mobile.domain.chat

/*
 * O markdown das respostas do agente (a vista "Conversa"). O web usa `react-markdown` com GFM; aqui um leitor pequeno cobre o
 * que as respostas trazem: parágrafos, títulos, listas (com tarefas), citações, código, tabelas e a marcação em linha.
 * HTML cru nunca é interpretado: vira texto, e imagens viram o texto alternativo.
 */

sealed interface Block {
    data class Paragraph(
        val children: List<Inline>,
    ) : Block

    /** Qualquer nível de título (`#` a `######`): o web os mostra todos como o mesmo título de resposta. */
    data class Heading(
        val children: List<Inline>,
    ) : Block

    data class CodeBlock(
        val text: String,
    ) : Block

    data class ListBlock(
        val ordered: Boolean,
        val start: Int,
        val items: List<ListItem>,
    ) : Block

    data class Quote(
        val blocks: List<Block>,
    ) : Block

    data class Table(
        val header: List<List<Inline>>,
        val rows: List<List<List<Inline>>>,
    ) : Block

    data object Rule : Block
}

/** Um item de lista; [checked] não nulo é item de tarefa (`- [x]`). */
data class ListItem(
    val checked: Boolean?,
    val blocks: List<Block>,
)

private val FENCE = Regex("^ {0,3}(```+|~~~+)(.*)$")
private val HEADING = Regex("^ {0,3}#{1,6}(?:\\s+(.*?))?(?:\\s+#+)?\\s*$")
private val RULE = Regex("^ {0,3}([-*_])(?:\\s*\\1){2,}\\s*$")
private val QUOTE = Regex("^ {0,3}>\\s?(.*)$")
private val LIST_MARKER = Regex("^(\\s*)([-*+]|\\d{1,9}[.)])(?:\\s+(.*)|$)")
private val TABLE_DIVIDER = Regex("^\\s*\\|?\\s*:?-+:?\\s*(\\|\\s*:?-+:?\\s*)*\\|?\\s*$")
private val TASK = Regex("^\\[([ xX])]\\s+(.*)$")

fun parseMarkdown(text: String): List<Block> = parseBlocks(text.replace("\r\n", "\n").replace('\r', '\n').split("\n"))

private fun isBlank(line: String) = line.isBlank()

private fun startsBlock(line: String): Boolean =
    FENCE.matches(line) || HEADING.matches(line) || RULE.matches(line) || QUOTE.matches(line) || LIST_MARKER.matches(line)

private fun parseBlocks(lines: List<String>): List<Block> {
    val blocks = mutableListOf<Block>()
    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        if (isBlank(line)) {
            i++
            continue
        }
        val fence = FENCE.matchEntire(line)
        if (fence != null) {
            val marker = fence.groupValues[1]
            val body = mutableListOf<String>()
            i++
            while (i < lines.size && !lines[i].trim().startsWith(marker)) body += lines[i++]
            i++
            blocks += Block.CodeBlock(body.joinToString("\n"))
            continue
        }
        val heading = HEADING.matchEntire(line)
        if (heading != null && line.trimStart().startsWith("#")) {
            blocks += Block.Heading(parseInline(heading.groupValues[1]))
            i++
            continue
        }
        if (RULE.matches(line)) {
            blocks += Block.Rule
            i++
            continue
        }
        if (QUOTE.matches(line)) {
            val inner = mutableListOf<String>()
            while (i < lines.size && (QUOTE.matches(lines[i]) || (!isBlank(lines[i]) && inner.isNotEmpty() && !startsBlock(lines[i])))) {
                inner += QUOTE.matchEntire(lines[i])?.groupValues?.get(1) ?: lines[i]
                i++
            }
            blocks += Block.Quote(parseBlocks(inner))
            continue
        }
        if (LIST_MARKER.matches(line)) {
            val (list, next) = parseList(lines, i)
            blocks += list
            i = next
            continue
        }
        if (line.contains('|') && i + 1 < lines.size && TABLE_DIVIDER.matches(lines[i + 1]) && lines[i + 1].contains('-')) {
            val header = splitRow(line).map(::parseInline)
            val rows = mutableListOf<List<List<Inline>>>()
            i += 2
            while (i < lines.size && !isBlank(lines[i]) && lines[i].contains('|')) rows += splitRow(lines[i++]).map(::parseInline)
            blocks += Block.Table(header, rows)
            continue
        }
        val paragraph = mutableListOf(line)
        i++
        while (i < lines.size && !isBlank(lines[i]) && !startsBlock(lines[i])) paragraph += lines[i++]
        blocks += Block.Paragraph(parseInline(joinParagraph(paragraph)))
    }
    return blocks
}

/** Quebra de linha dura (dois espaços ou barra no fim) fica como `\n`; a quebra simples vira espaço, como no HTML. */
private fun joinParagraph(lines: List<String>): String =
    buildString {
        lines.forEachIndexed { index, raw ->
            val hard = raw.endsWith("  ") || raw.endsWith("\\")
            append(raw.trim().removeSuffix("\\"))
            if (index < lines.lastIndex) append(if (hard) "\n" else " ")
        }
    }

private fun splitRow(line: String): List<String> {
    val trimmed = line.trim().removePrefix("|").removeSuffix("|")
    val cells = mutableListOf<String>()
    val cell = StringBuilder()
    var i = 0
    while (i < trimmed.length) {
        val c = trimmed[i]
        if (c == '\\' && i + 1 < trimmed.length && trimmed[i + 1] == '|') {
            cell.append('|')
            i += 2
            continue
        }
        if (c == '|') {
            cells += cell.toString().trim()
            cell.clear()
        } else {
            cell.append(c)
        }
        i++
    }
    cells += cell.toString().trim()
    return cells
}

private fun parseList(
    lines: List<String>,
    from: Int,
): Pair<Block.ListBlock, Int> {
    val first = LIST_MARKER.matchEntire(lines[from])!!
    val baseIndent = first.groupValues[1].length
    val ordered = first.groupValues[2].first().isDigit()
    val start = if (ordered) first.groupValues[2].takeWhile { it.isDigit() }.toInt() else 1
    val items = mutableListOf<ListItem>()
    var i = from
    while (i < lines.size) {
        val marker = LIST_MARKER.matchEntire(lines[i]) ?: break
        if (marker.groupValues[1].length != baseIndent || marker.groupValues[2].first().isDigit() != ordered) {
            // Um marcador mais fundo é item aninhado, que o laço de baixo já recolheu; outro tipo de lista a encerra.
            break
        }
        val content = mutableListOf(marker.groupValues[3])
        i++
        while (i < lines.size) {
            val line = lines[i]
            if (isBlank(line)) {
                val next = lines.getOrNull(i + 1)
                if (next != null && !isBlank(next) && indentOf(next) > baseIndent) {
                    content += ""
                    i++
                    continue
                }
                break
            }
            val nested = LIST_MARKER.matchEntire(line)
            if (indentOf(line) > baseIndent) {
                content += line.drop(minOf(indentOf(line), baseIndent + 2))
                i++
            } else if (nested == null && !startsBlock(line)) {
                content += line.trim()
                i++
            } else {
                break
            }
        }
        val task = TASK.matchEntire(content[0])
        val blocks = parseBlocks(if (task != null) listOf(task.groupValues[2]) + content.drop(1) else content)
        items += ListItem(task?.groupValues?.get(1)?.let { it != " " }, blocks)
    }
    return Block.ListBlock(ordered, start, items) to i
}

private fun indentOf(line: String): Int = line.length - line.trimStart().length

private val BARE_URL = Regex("(?:https?://|www\\.)[^\\s<]+")
private const val URL_TRAILING = ".,;:!?)\"'"

/** O markdown em linha: código, negrito, itálico, tachado, links e endereços soltos. */
fun parseInline(source: String): List<Inline> {
    val out = mutableListOf<Inline>()
    val text = StringBuilder()

    fun flush() {
        if (text.isNotEmpty()) out += Inline.Text(text.toString())
        text.clear()
    }
    var i = 0
    while (i < source.length) {
        val c = source[i]
        if (c == '*' || c == '_' || c == '~') {
            val next = emphasis(source, i, text, ::flush, out)
            if (next != null) {
                i = next
                continue
            }
        }
        when {
            c == '\\' && i + 1 < source.length && !source[i + 1].isLetterOrDigit() && source[i + 1] != '\n' -> {
                text.append(source[i + 1])
                i += 2
            }
            c == '\n' -> {
                flush()
                out += Inline.LineBreak
                i++
            }
            c == '`' -> {
                val ticks = source.substring(i).takeWhile { it == '`' }
                val close = source.indexOf(ticks, i + ticks.length)
                if (close < 0) {
                    text.append(ticks)
                    i += ticks.length
                } else {
                    flush()
                    out += Inline.Code(source.substring(i + ticks.length, close).trim())
                    i = close + ticks.length
                }
            }
            c == '!' && source.startsWith("![", i) -> {
                val link = matchLink(source, i + 1)
                if (link == null) {
                    text.append(c)
                    i++
                } else {
                    text.append(link.label)
                    i = link.end
                }
            }
            c == '[' -> {
                val link = matchLink(source, i)
                if (link == null) {
                    text.append(c)
                    i++
                } else {
                    flush()
                    out += Inline.Link(link.href, parseInline(link.label))
                    i = link.end
                }
            }
            c == '<' && source.startsWith("<http", i) && source.indexOf('>', i) > 0 -> {
                val close = source.indexOf('>', i)
                val href = source.substring(i + 1, close)
                flush()
                out += Inline.Link(href, listOf(Inline.Text(href)))
                i = close + 1
            }
            (c == 'h' || c == 'w') && isUrlStart(source, i, text) -> {
                val match = BARE_URL.matchAt(source, i)!!
                val raw =
                    match.value.trimEnd {
                        it in URL_TRAILING &&
                            !(it == ')' && match.value.count { ch -> ch == '(' } >= match.value.count { ch -> ch == ')' })
                    }
                flush()
                val href = if (raw.startsWith("www.")) "https://$raw" else raw
                out += Inline.Link(href, listOf(Inline.Text(raw)))
                i += raw.length
            }
            else -> {
                text.append(c)
                i++
            }
        }
    }
    flush()
    return out
}

private fun isUrlStart(
    source: String,
    index: Int,
    pending: CharSequence,
): Boolean {
    if (pending.isNotEmpty() && pending.last().isLetterOrDigit()) return false
    return BARE_URL.matchAt(source, index) != null
}

private class LinkMatch(
    val label: String,
    val href: String,
    val end: Int,
)

/** `[texto](endereço)` a partir do colchete em [from]; os colchetes e parênteses de dentro precisam fechar. */
private fun matchLink(
    source: String,
    from: Int,
): LinkMatch? {
    var depth = 0
    var i = from
    while (i < source.length) {
        when (source[i]) {
            '\\' -> i++
            '[' -> depth++
            ']' -> {
                depth--
                if (depth == 0) break
            }
        }
        i++
    }
    if (i >= source.length || depth != 0 || source.getOrNull(i + 1) != '(') return null
    var j = i + 2
    var parens = 1
    while (j < source.length && parens > 0) {
        when (source[j]) {
            '(' -> parens++
            ')' -> parens--
        }
        j++
    }
    if (parens != 0) return null
    val href =
        source
            .substring(i + 2, j - 1)
            .trim()
            .substringBefore(' ')
            .removeSurrounding("<", ">")
    return LinkMatch(source.substring(from + 1, i), href, j)
}

/**
 * Abre uma marcação de ênfase em [at] se ela fecha adiante; devolve o índice depois do fecho, ou `null` quando o caractere
 * é só texto (nesse caso nada foi escrito em [out]).
 */
private fun emphasis(
    source: String,
    at: Int,
    pending: StringBuilder,
    flush: () -> Unit,
    out: MutableList<Inline>,
): Int? {
    val c = source[at]
    val doubled = source.startsWith("$c$c", at) && c != '_' || (c == '_' && source.startsWith("__", at))
    val marker = if (doubled) "$c$c" else "$c"
    // `~` só vale dobrado, e o sublinhado no meio de uma palavra (`snake_case`) é texto.
    if (c == '~' && !doubled) return null
    if (c == '_' && pending.isNotEmpty() && pending.last().isLetterOrDigit()) return null
    val open = at + marker.length
    if (open >= source.length || source[open].isWhitespace()) return null
    var close = source.indexOf(marker, open)
    while (close >= 0 &&
        (source[close - 1].isWhitespace() || (c == '_' && source.getOrNull(close + marker.length)?.isLetterOrDigit() == true))
    ) {
        close = source.indexOf(marker, close + 1)
    }
    if (close <= open) return null
    // `***a***`: o fecho é o fim da sequência de marcadores, para o de dentro fechar primeiro.
    while (source.getOrNull(close + marker.length) == c) close++
    val inner = parseInline(source.substring(open, close))
    flush()
    out +=
        when {
            c == '~' -> Inline.Strike(inner)
            doubled -> Inline.Strong(inner)
            else -> Inline.Emphasis(inner)
        }
    return close + marker.length
}
