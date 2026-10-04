package app.braid.mobile.domain.notes

/**
 * O markdown das notas de texto, em árvore. É a porta do que o web mostra com
 * `react-markdown` + GFM: títulos, ênfase, código, links, listas (com tarefas e
 * aninhamento), citações, blocos de código e linha horizontal. Tabelas não são
 * desenhadas no app: as linhas aparecem como texto.
 */
sealed interface MdInline {
    data class Text(
        val text: String,
    ) : MdInline

    data class Bold(
        val children: List<MdInline>,
    ) : MdInline

    data class Italic(
        val children: List<MdInline>,
    ) : MdInline

    data class Strike(
        val children: List<MdInline>,
    ) : MdInline

    data class Code(
        val text: String,
    ) : MdInline

    data class Link(
        val children: List<MdInline>,
        val url: String,
    ) : MdInline
}

/** Um item de lista. `number` só existe em lista numerada; `checked`, só em tarefa. */
data class MdListItem(
    val inlines: List<MdInline>,
    val depth: Int,
    val number: Int? = null,
    val checked: Boolean? = null,
)

sealed interface MdBlock {
    data class Paragraph(
        val inlines: List<MdInline>,
    ) : MdBlock

    data class Heading(
        val level: Int,
        val inlines: List<MdInline>,
    ) : MdBlock

    data class ListBlock(
        val items: List<MdListItem>,
    ) : MdBlock

    data class Quote(
        val blocks: List<MdBlock>,
    ) : MdBlock

    data class CodeBlock(
        val text: String,
    ) : MdBlock

    data object Rule : MdBlock
}

private val fence = Regex("^\\s{0,3}(```|~~~)")
private val heading = Regex("^\\s{0,3}(#{1,6})\\s+(.*?)(?:\\s+#+)?\\s*$")
private val rule = Regex("^\\s{0,3}([-*_])(?:\\s*\\1){2,}\\s*$")
private val quote = Regex("^\\s{0,3}>\\s?(.*)$")
private val bullet = Regex("^(\\s*)[-*+]\\s+(?:\\[([ xX])]\\s+)?(.*)$")
private val ordered = Regex("^(\\s*)(\\d+)[.)]\\s+(.*)$")
private val allowedLink = Regex("^(https?://|mailto:)", RegexOption.IGNORE_CASE)

private fun indentDepth(indent: String): Int = indent.replace("\t", "    ").length / 2

private fun startsBlock(line: String): Boolean =
    line.isBlank() ||
        fence.containsMatchIn(line) ||
        heading.matches(line) ||
        rule.matches(line) ||
        quote.matches(line) ||
        bullet.matches(line) ||
        ordered.matches(line)

fun parseMarkdown(source: String): List<MdBlock> {
    val lines = source.replace("\r\n", "\n").split("\n")
    val blocks = mutableListOf<MdBlock>()
    var index = 0

    while (index < lines.size) {
        val line = lines[index]
        val open = fence.find(line)
        val headingMatch = heading.matchEntire(line)
        when {
            line.isBlank() -> index++
            open != null -> {
                val marker = open.groupValues[1]
                val code = mutableListOf<String>()
                index++
                while (index < lines.size && !lines[index].trimStart().startsWith(marker)) code += lines[index++]
                index++ // a cerca de fechamento (ou o fim do texto, se a cerca ficou aberta)
                blocks += MdBlock.CodeBlock(code.joinToString("\n"))
            }
            headingMatch != null -> {
                blocks += MdBlock.Heading(headingMatch.groupValues[1].length, parseInlines(headingMatch.groupValues[2]))
                index++
            }
            rule.matches(line) -> {
                blocks += MdBlock.Rule
                index++
            }
            quote.matches(line) -> {
                val inner = mutableListOf<String>()
                while (index < lines.size) {
                    inner += quote.matchEntire(lines[index])?.groupValues?.get(1) ?: break
                    index++
                }
                blocks += MdBlock.Quote(parseMarkdown(inner.joinToString("\n")))
            }
            bullet.matches(line) || ordered.matches(line) -> {
                val isOrdered = !bullet.matches(line)
                val items = mutableListOf<MdListItem>()
                val counters = mutableMapOf<Int, Int>()
                while (index < lines.size) {
                    val current = lines[index]
                    val bulletMatch = bullet.matchEntire(current)?.takeUnless { rule.matches(current) }
                    val orderedMatch = ordered.matchEntire(current)
                    val marker = bulletMatch ?: orderedMatch
                    if (marker != null) {
                        val depth = indentDepth(marker.groupValues[1])
                        // Uma lista de outro tipo, no nível de cima, é outra lista.
                        if (depth == 0 && (orderedMatch != null) != isOrdered && items.isNotEmpty()) break
                        counters.keys.filter { it > depth }.forEach(counters::remove)
                        if (bulletMatch != null) {
                            val (_, box, text) = bulletMatch.destructured
                            val checked = box.takeIf { it.isNotEmpty() }?.let { it != " " }
                            items += MdListItem(parseInlines(text), depth, checked = checked)
                        } else if (orderedMatch != null) {
                            val (_, start, text) = orderedMatch.destructured
                            val number = counters[depth]?.plus(1) ?: start.toInt()
                            counters[depth] = number
                            items += MdListItem(parseInlines(text), depth, number = number)
                        }
                    } else if (current.isNotBlank() && current.first().isWhitespace() && items.isNotEmpty()) {
                        val last = items.removeAt(items.lastIndex)
                        items += last.copy(inlines = last.inlines + MdInline.Text(" ") + parseInlines(current.trim()))
                    } else {
                        break
                    }
                    index++
                }
                blocks += MdBlock.ListBlock(items)
            }
            else -> {
                val text = mutableListOf<String>()
                while (index < lines.size && (text.isEmpty() || !startsBlock(lines[index]))) text += lines[index++].trim()
                blocks += MdBlock.Paragraph(parseInlines(text.joinToString("\n")))
            }
        }
    }
    return blocks
}

private const val ESCAPABLE = "\\`*_{}[]()#+-.!~>|"

/** O fim do trecho entre `open` e o `close` que o fecha, ou -1 se ele não fecha com conteúdo. */
private fun closing(
    text: String,
    from: Int,
    close: String,
): Int {
    var i = from
    while (true) {
        i = text.indexOf(close, i)
        if (i < 0) return -1
        if (i == from) return -1
        if (!text[i - 1].isWhitespace() && text[i - 1] != '\\') {
            // Numa sequência de marcas (`***`), quem fecha são as últimas: as de dentro ficam para o aninhamento.
            var runEnd = i
            while (text.getOrNull(runEnd) == close[0]) runEnd++
            return maxOf(i, runEnd - close.length)
        }
        i += close.length
    }
}

/** O `)` que fecha o endereço do link, contando os parênteses de dentro (`/wiki/A_(b)`). */
private fun closingParenthesis(
    text: String,
    from: Int,
): Int {
    var depth = 0
    for (index in from until text.length) {
        when (text[index]) {
            '(' -> depth++
            ')' -> if (depth == 0) return index else depth--
        }
    }
    return -1
}

private fun isWordChar(char: Char?): Boolean = char != null && char.isLetterOrDigit()

fun parseInlines(text: String): List<MdInline> {
    val out = mutableListOf<MdInline>()
    val plain = StringBuilder()

    fun flush() {
        if (plain.isNotEmpty()) out += MdInline.Text(plain.toString())
        plain.clear()
    }

    var i = 0
    while (i < text.length) {
        val char = text[i]
        val next = text.getOrNull(i + 1)

        if (char == '\\' && next != null && next in ESCAPABLE) {
            plain.append(next)
            i += 2
            continue
        }

        if (char == '`') {
            val ticks = text.substring(i).takeWhile { it == '`' }
            val end = text.indexOf(ticks, i + ticks.length)
            if (end > i + ticks.length) {
                flush()
                out += MdInline.Code(text.substring(i + ticks.length, end).trim())
                i = end + ticks.length
                continue
            }
        }

        if (char == '[') {
            val labelEnd = text.indexOf("](", i + 1)
            val urlEnd = if (labelEnd < 0) -1 else closingParenthesis(text, labelEnd + 2)
            if (labelEnd > i + 1 && urlEnd > labelEnd) {
                val label = parseInlines(text.substring(i + 1, labelEnd))
                val url = text.substring(labelEnd + 2, urlEnd).trim().substringBefore(' ')
                flush()
                // Só endereços web e e-mail viram link; qualquer outro esquema fica como texto.
                if (allowedLink.containsMatchIn(url)) out += MdInline.Link(label, url) else out += label
                i = urlEnd + 1
                continue
            }
        }

        val pair = if (next == char && (char == '*' || char == '_' || char == '~')) "$char$char" else null
        if (pair != null && !text.getOrNull(i + 2).let { it == null || it.isWhitespace() }) {
            val end = closing(text, i + 2, pair)
            val boundary = char != '_' || (!isWordChar(text.getOrNull(i - 1)) && !isWordChar(text.getOrNull(end + 2)))
            if (end > 0 && boundary) {
                flush()
                val inner = parseInlines(text.substring(i + 2, end))
                out += if (char == '~') MdInline.Strike(inner) else MdInline.Bold(inner)
                i = end + 2
                continue
            }
        }

        if ((char == '*' || char == '_') && next != null && !next.isWhitespace() && next != char) {
            var end = i + 1
            while (true) {
                end = text.indexOf(char, end)
                if (end < 0) break
                val doubled = text.getOrNull(end + 1) == char || text[end - 1] == char
                if (!doubled && !text[end - 1].isWhitespace()) break
                end += if (text.getOrNull(end + 1) == char) 2 else 1
            }
            val boundary = char != '_' || (!isWordChar(text.getOrNull(i - 1)) && !isWordChar(text.getOrNull(end + 1)))
            if (end > i + 1 && boundary) {
                flush()
                out += MdInline.Italic(parseInlines(text.substring(i + 1, end)))
                i = end + 1
                continue
            }
        }

        plain.append(char)
        i++
    }
    flush()
    return out
}
