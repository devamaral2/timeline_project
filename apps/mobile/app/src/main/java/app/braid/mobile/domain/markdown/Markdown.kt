package app.braid.mobile.domain.markdown

/*
 * O markdown dos artefatos de texto, no subconjunto que o web mostra: títulos, parágrafos, listas (com marcadores,
 * numeradas e de tarefas), citações, código, régua, tabelas, ênfase, código em linha, riscado e links. HTML cru nunca
 * é interpretado (vira texto). A imagem só é lida como imagem (`MarkdownInline.Image`) quando quem chama pede, e só se o
 * endereço for `http(s)`: o leitor de artefatos pede; o chat e o assistente não, e ali ela vira o texto alternativo.
 */

sealed interface MarkdownBlock {
    /** [level] é o do markdown (1 a 6); a tela desce o título `#` para o tamanho de seção, porque o `h1` é o nome do artefato. */
    data class Heading(
        val level: Int,
        val content: List<MarkdownInline>,
    ) : MarkdownBlock

    /** [anchor] é o id `t-<segundos>` quando o parágrafo abre com `{#t-<segundos>}` (ver `Anchors.kt`); a marca não fica no conteúdo. */
    data class Paragraph(
        val content: List<MarkdownInline>,
        val anchor: String? = null,
    ) : MarkdownBlock

    data class ListBlock(
        val ordered: Boolean,
        val start: Int,
        val items: List<MarkdownListItem>,
    ) : MarkdownBlock

    data class Code(
        val text: String,
    ) : MarkdownBlock

    data class Quote(
        val blocks: List<MarkdownBlock>,
    ) : MarkdownBlock

    data object Rule : MarkdownBlock

    data class Table(
        val header: List<List<MarkdownInline>>,
        val rows: List<List<List<MarkdownInline>>>,
    ) : MarkdownBlock
}

/** Um item de lista; [checked] é `null` fora de uma lista de tarefas. */
data class MarkdownListItem(
    val blocks: List<MarkdownBlock>,
    val checked: Boolean? = null,
)

sealed interface MarkdownInline {
    data class Text(
        val text: String,
    ) : MarkdownInline

    data class Strong(
        val content: List<MarkdownInline>,
    ) : MarkdownInline

    data class Emphasis(
        val content: List<MarkdownInline>,
    ) : MarkdownInline

    data class Strike(
        val content: List<MarkdownInline>,
    ) : MarkdownInline

    data class Code(
        val text: String,
    ) : MarkdownInline

    data class Link(
        val href: String,
        val content: List<MarkdownInline>,
    ) : MarkdownInline

    /** Uma imagem de um endereço `http(s)`; [alt] é o texto alternativo, que pode vir vazio. */
    data class Image(
        val src: String,
        val alt: String,
    ) : MarkdownInline

    data object LineBreak : MarkdownInline
}

/** [images] liga a leitura de imagem; desligado, ela vira o texto alternativo. */
fun parseMarkdown(
    source: String,
    images: Boolean = false,
): List<MarkdownBlock> = BlockParser(images).parse(source.split(Regex("\r?\n")))

private class BlockParser(
    private val images: Boolean,
) {
    private val heading = Regex("^ {0,3}(#{1,6})[ \\t]+(.*?)(?:[ \\t]+#+)?[ \\t]*$")
    private val emptyHeading = Regex("^ {0,3}(#{1,6})[ \\t]*$")
    private val fence = Regex("^ {0,3}(`{3,}|~{3,})(.*)$")
    private val rule = Regex("^ {0,3}([-*_])(?:[ \\t]*\\1){2,}[ \\t]*$")
    private val quote = Regex("^ {0,3}>[ ]?(.*)$")
    private val listMarker = Regex("^( {0,3})([-*+]|\\d{1,9}[.)])([ \\t]+|$)(.*)$")
    private val tableDelimiter = Regex("^[ \\t]*\\|?[ \\t]*:?-+:?[ \\t]*(\\|[ \\t]*:?-+:?[ \\t]*)*\\|?[ \\t]*$")
    private val taskMarker = Regex("^\\[([ xX])][ \\t]+(.*)$")

    fun parse(lines: List<String>): List<MarkdownBlock> {
        val blocks = mutableListOf<MarkdownBlock>()
        var index = 0
        while (index < lines.size) {
            val line = lines[index]
            if (line.isBlank()) {
                index++
                continue
            }
            index =
                parseFence(lines, index, blocks)
                    ?: parseHeading(line, index, blocks)
                    ?: parseRule(line, index, blocks)
                    ?: parseQuote(lines, index, blocks)
                    ?: parseList(lines, index, blocks)
                    ?: parseTable(lines, index, blocks)
                    ?: parseParagraph(lines, index, blocks)
        }
        return blocks
    }

    private fun parseFence(
        lines: List<String>,
        start: Int,
        blocks: MutableList<MarkdownBlock>,
    ): Int? {
        val open = fence.matchEntire(lines[start]) ?: return null
        val marker = open.groupValues[1]
        if (marker[0] == '`' && open.groupValues[2].contains('`')) return null
        val body = mutableListOf<String>()
        var index = start + 1
        while (index < lines.size && !isClosingFence(lines[index], marker)) body += lines[index++]
        blocks += MarkdownBlock.Code(body.joinToString("\n"))
        return minOf(index + 1, lines.size)
    }

    private fun isClosingFence(
        line: String,
        marker: String,
    ): Boolean = line.trim().let { it.length >= marker.length && it.all { char -> char == marker[0] } }

    private fun parseHeading(
        line: String,
        index: Int,
        blocks: MutableList<MarkdownBlock>,
    ): Int? {
        heading.matchEntire(line)?.let {
            blocks += MarkdownBlock.Heading(it.groupValues[1].length, parseInline(it.groupValues[2].trim(), images))
            return index + 1
        }
        emptyHeading.matchEntire(line)?.let {
            blocks += MarkdownBlock.Heading(it.groupValues[1].length, emptyList())
            return index + 1
        }
        return null
    }

    private fun parseRule(
        line: String,
        index: Int,
        blocks: MutableList<MarkdownBlock>,
    ): Int? {
        if (!rule.matches(line)) return null
        blocks += MarkdownBlock.Rule
        return index + 1
    }

    private fun parseQuote(
        lines: List<String>,
        start: Int,
        blocks: MutableList<MarkdownBlock>,
    ): Int? {
        if (!quote.matches(lines[start])) return null
        val inner = mutableListOf<String>()
        var index = start
        while (index < lines.size) {
            val match = quote.matchEntire(lines[index])
            if (match != null) {
                inner += match.groupValues[1]
            } else if (lines[index].isBlank() || startsBlock(lines[index])) {
                break
            } else {
                // Continuação preguiçosa: a linha sem `>` ainda é do parágrafo da citação.
                inner += lines[index]
            }
            index++
        }
        blocks += MarkdownBlock.Quote(parse(inner))
        return index
    }

    private fun parseList(
        lines: List<String>,
        start: Int,
        blocks: MutableList<MarkdownBlock>,
    ): Int? {
        val first = listMarker.matchEntire(lines[start]) ?: return null
        if (rule.matches(lines[start])) return null
        val ordered = first.groupValues[2].first().isDigit()
        val startNumber = if (ordered) first.groupValues[2].dropLast(1).toInt() else 1
        val items = mutableListOf<MarkdownListItem>()
        var index = start
        while (index < lines.size) {
            val marker = listMarker.matchEntire(lines[index])
            if (marker == null || rule.matches(lines[index]) || marker.groupValues[2].first().isDigit() != ordered) break
            val contentIndent = marker.groupValues[1].length + marker.groupValues[2].length + 1
            val itemLines = mutableListOf(marker.groupValues[4])
            index++
            var pendingBlank = 0
            while (index < lines.size) {
                val line = lines[index]
                if (line.isBlank()) {
                    pendingBlank++
                    index++
                    continue
                }
                val indent = line.takeWhile { it == ' ' }.length
                if (indent >= contentIndent) {
                    repeat(pendingBlank) { itemLines += "" }
                    itemLines += line.substring(contentIndent)
                } else if (pendingBlank == 0 && !startsBlock(line) && listMarker.matchEntire(line) == null) {
                    itemLines += line.trimStart()
                } else {
                    break
                }
                pendingBlank = 0
                index++
            }
            items += listItem(itemLines)
            // Linhas em branco entre itens não encerram a lista; qualquer outra coisa que não seja item, sim.
            val next = lines.getOrNull(index)
            if (next == null || listMarker.matchEntire(next) == null) break
        }
        blocks += MarkdownBlock.ListBlock(ordered, startNumber, items)
        return index
    }

    private fun listItem(lines: List<String>): MarkdownListItem {
        val task = taskMarker.matchEntire(lines.first())
        val content = if (task != null) listOf(task.groupValues[2]) + lines.drop(1) else lines
        return MarkdownListItem(parse(content), checked = task?.let { it.groupValues[1] != " " })
    }

    private fun parseTable(
        lines: List<String>,
        start: Int,
        blocks: MutableList<MarkdownBlock>,
    ): Int? {
        val header = lines[start]
        if (!header.contains('|') || start + 1 >= lines.size) return null
        val delimiter = lines[start + 1]
        if (!delimiter.contains('-') || !tableDelimiter.matches(delimiter)) return null
        val columns = splitRow(header)
        if (columns.size != splitRow(delimiter).size) return null
        val rows = mutableListOf<List<List<MarkdownInline>>>()
        var index = start + 2
        while (index < lines.size && lines[index].isNotBlank() && !startsBlock(lines[index])) {
            val cells = splitRow(lines[index])
            rows += List(columns.size) { column -> parseInline(cells.getOrElse(column) { "" }, images) }
            index++
        }
        blocks += MarkdownBlock.Table(columns.map { parseInline(it, images) }, rows)
        return index
    }

    private fun splitRow(line: String): List<String> {
        val trimmed = line.trim().removePrefix("|").removeSuffix("|")
        val cells = mutableListOf<String>()
        val current = StringBuilder()
        var escaped = false
        for (char in trimmed) {
            when {
                escaped -> {
                    current.append(if (char == '|') "|" else "\\$char")
                    escaped = false
                }
                char == '\\' -> escaped = true
                char == '|' -> {
                    cells += current.toString().trim()
                    current.clear()
                }
                else -> current.append(char)
            }
        }
        if (escaped) current.append('\\')
        cells += current.toString().trim()
        return cells
    }

    private fun parseParagraph(
        lines: List<String>,
        start: Int,
        blocks: MutableList<MarkdownBlock>,
    ): Int {
        val text = mutableListOf(lines[start])
        var index = start + 1
        while (index < lines.size && lines[index].isNotBlank() && !startsBlock(lines[index])) text += lines[index++]
        // Um espaço duplo no fim da linha, ou a barra invertida, é quebra; o resto da quebra vira espaço.
        val joined = StringBuilder()
        text.forEachIndexed { position, line ->
            val last = position == text.lastIndex
            val hard = !last && (line.endsWith("  ") || line.endsWith("\\"))
            joined.append(if (hard) line.trimEnd().removeSuffix("\\") else line.trim())
            if (!last) joined.append(if (hard) "\n" else " ")
        }
        val body = joined.toString().trim()
        val mark = splitAnchorMark(body)
        blocks += MarkdownBlock.Paragraph(parseInline(mark?.second ?: body, images), mark?.first)
        return index
    }

    /** A linha abre um bloco que interrompe o parágrafo. */
    private fun startsBlock(line: String): Boolean =
        heading.matches(line) ||
            emptyHeading.matches(line) ||
            fence.matches(line) ||
            rule.matches(line) ||
            quote.matches(line) ||
            listMarker.matchEntire(line)?.let { it.groupValues[4].isNotBlank() } == true
}

/** O endereço é `http` ou `https`: o único que o leitor busca. */
fun isRemoteUrl(href: String): Boolean = href.startsWith("http://", true) || href.startsWith("https://", true)

private val angleAutolink = Regex("^<(https?://[^\\s<>]+)>")

private val escapable = "\\`*_{}[]()#+-.!|~<>\"'$%&,/:;=?@^"

/** O texto em linha: código, links, ênfase e riscado. O que não fecha vira texto. */
fun parseInline(
    text: String,
    images: Boolean = false,
): List<MarkdownInline> {
    val out = mutableListOf<MarkdownInline>()
    val plain = StringBuilder()

    fun flush() {
        if (plain.isNotEmpty()) {
            out += MarkdownInline.Text(plain.toString())
            plain.clear()
        }
    }

    var index = 0
    while (index < text.length) {
        val char = text[index]
        when {
            char == '\\' && index + 1 < text.length && text[index + 1] in escapable -> {
                plain.append(text[index + 1])
                index += 2
            }
            char == '\n' -> {
                flush()
                out += MarkdownInline.LineBreak
                index++
            }
            char == '`' -> {
                val run = text.drop(index).takeWhile { it == '`' }.length
                val close = findBacktickRun(text, index + run, run)
                if (close < 0) {
                    plain.append("`".repeat(run))
                    index += run
                } else {
                    flush()
                    out +=
                        MarkdownInline.Code(
                            text
                                .substring(index + run, close)
                                .replace('\n', ' ')
                                .trim(' ')
                                .ifEmpty { " " },
                        )
                    index = close + run
                }
            }
            char == '!' && text.startsWith("![", index) -> {
                val link = parseLink(text, index + 1)
                if (link == null) {
                    plain.append(char)
                    index++
                } else {
                    if (images && isRemoteUrl(link.href)) {
                        flush()
                        out += MarkdownInline.Image(link.href, link.label)
                    } else {
                        // Sem leitura de imagem, ou com um endereço que não é da rede: fica o texto alternativo.
                        plain.append(link.label)
                    }
                    index = link.end
                }
            }
            char == '[' -> {
                val link = parseLink(text, index)
                if (link == null) {
                    plain.append(char)
                    index++
                } else {
                    flush()
                    out += MarkdownInline.Link(link.href, parseInline(link.label, images))
                    index = link.end
                }
            }
            char == '<' && angleAutolink.find(text.substring(index)) != null -> {
                val match = angleAutolink.find(text.substring(index))!!
                flush()
                out += MarkdownInline.Link(match.groupValues[1], listOf(MarkdownInline.Text(match.groupValues[1])))
                index += match.value.length
            }
            (char == 'h' || char == 'w') && isBareUrlAt(text, index) -> {
                val url = bareUrl(text, index)
                flush()
                // Um endereço que começa em `www.` (sem protocolo) abre em https, como no GFM.
                val href = if (url.startsWith("www.")) "https://$url" else url
                out += MarkdownInline.Link(href, listOf(MarkdownInline.Text(url)))
                index += url.length
            }
            char == '*' || char == '_' || char == '~' -> {
                val emphasis = parseEmphasis(text, index, images)
                if (emphasis == null) {
                    plain.append(char)
                    index++
                } else {
                    flush()
                    out += emphasis.first
                    index = emphasis.second
                }
            }
            else -> {
                plain.append(char)
                index++
            }
        }
    }
    flush()
    return out
}

private fun findBacktickRun(
    text: String,
    from: Int,
    run: Int,
): Int {
    var index = from
    while (index < text.length) {
        if (text[index] == '`') {
            val length = text.drop(index).takeWhile { it == '`' }.length
            if (length == run) return index
            index += length
        } else {
            index++
        }
    }
    return -1
}

private class ParsedLink(
    val label: String,
    val href: String,
    val end: Int,
)

/** `[texto](destino "título")` a partir do `[` em [open]; colchetes e parênteses aninhados contam. */
private fun parseLink(
    text: String,
    open: Int,
): ParsedLink? {
    var depth = 0
    var index = open
    var close = -1
    while (index < text.length) {
        when (text[index]) {
            '\\' -> index++
            '[' -> depth++
            ']' -> {
                depth--
                if (depth == 0) {
                    close = index
                    break
                }
            }
        }
        index++
    }
    if (close < 0 || close + 1 >= text.length || text[close + 1] != '(') return null
    var parens = 1
    var end = close + 2
    while (end < text.length && parens > 0) {
        when (text[end]) {
            '(' -> parens++
            ')' -> parens--
        }
        end++
    }
    if (parens != 0) return null
    val destination = text.substring(close + 2, end - 1).trim()
    val href =
        destination.removePrefix("<").substringBefore('>').let {
            if (destination.startsWith("<")) it else destination.substringBefore(' ')
        }
    return ParsedLink(text.substring(open + 1, close), href, end)
}

private fun isBareUrlAt(
    text: String,
    index: Int,
): Boolean =
    (
        text.startsWith(
            "http://",
            index,
        ) ||
            text.startsWith("https://", index) ||
            (text.startsWith("www.", index) && index + 4 < text.length)
    ) &&
        (index == 0 || !text[index - 1].isLetterOrDigit())

private fun bareUrl(
    text: String,
    index: Int,
): String {
    var end = index
    while (end < text.length && !text[end].isWhitespace() && text[end] != '<') end++
    var url = text.substring(index, end)
    while (url.isNotEmpty() && (url.last() in ".,;:!?*_~\"'" || (url.last() == ')' && url.count { it == ')' } > url.count { it == '(' }))) {
        url = url.dropLast(1)
    }
    return url
}

/** Ênfase, negrito ou riscado que abre em [open]: devolve o nó e onde o texto continua, ou `null` se não fechar. */
private fun parseEmphasis(
    text: String,
    open: Int,
    images: Boolean,
): Pair<MarkdownInline, Int>? {
    val char = text[open]
    val run = text.drop(open).takeWhile { it == char }.length
    if (char == '~' && run != 2) return null
    val width = if (char == '~') 2 else minOf(run, 2)
    val afterOpen = open + width
    if (afterOpen >= text.length || text[afterOpen].isWhitespace()) return null
    // O sublinhado no meio de uma palavra (snake_case) não abre ênfase.
    if (char == '_' && open > 0 && text[open - 1].isLetterOrDigit()) return null
    val delimiter = char.toString().repeat(width)
    var search = afterOpen
    while (search < text.length) {
        val close = text.indexOf(delimiter, search)
        if (close < 0) return null
        val before = text[close - 1]
        val after = text.getOrNull(close + width)
        val closes =
            close > afterOpen &&
                !before.isWhitespace() &&
                (char != '_' || after == null || !after.isLetterOrDigit()) &&
                // `**` não fecha no meio de `***`.
                (width == 2 || (after != char && before != char))
        if (closes) {
            // `**a *b***`: o fecho é o fim da sequência de marcadores, para o de dentro fechar primeiro.
            var end = close
            while (width == 2 && char != '~' && text.getOrNull(end + width) == char) end++
            val content = parseInline(text.substring(afterOpen, end), images)
            val node =
                when {
                    char == '~' -> MarkdownInline.Strike(content)
                    width == 2 -> MarkdownInline.Strong(content)
                    else -> MarkdownInline.Emphasis(content)
                }
            return node to end + width
        }
        search = close + 1
    }
    return null
}
