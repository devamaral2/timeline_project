package app.braid.mobile.domain.notes

/**
 * A regra de digitação do editor de markdown, como no web
 * (`lib/notes/markdown-editing.ts`): Enter continua a lista, ou a encerra se o
 * item está vazio. Função pura sobre texto e posição do cursor.
 */
data class TextEdit(
    val value: String,
    val cursor: Int,
)

private val listLine = Regex("^(\\s*)(?:([-*+])\\s+(\\[[ xX]]\\s+)?|(\\d+)([.)])\\s+|(>)\\s?)(.*)$")

fun continueMarkdownList(
    value: String,
    cursor: Int,
): TextEdit? {
    val start = value.lastIndexOf('\n', cursor - 1) + 1
    val end = value.indexOf('\n', cursor).let { if (it == -1) value.length else it }
    val line = value.substring(start, end)
    val match = listLine.matchEntire(line) ?: return null

    val groups = match.groupValues
    val indent = groups[1]
    val bullet = groups[2]
    val task = groups[3]
    val ordinal = groups[4]
    val delimiter = groups[5]
    val quote = groups[6]
    val rest = groups[7]
    val markerLength = line.length - rest.length
    // O cursor antes do fim do marcador é edição do marcador, não continuação.
    if (cursor - start < markerLength) return null

    if (rest.isBlank()) return TextEdit(value.removeRange(start, end), start)

    val marker =
        when {
            quote.isNotEmpty() -> "> "
            ordinal.isNotEmpty() -> "${ordinal.toInt() + 1}$delimiter "
            else -> "$bullet ${if (task.isNotEmpty()) "[ ] " else ""}"
        }
    val insertion = "\n$indent$marker"
    return TextEdit(value.substring(0, cursor) + insertion + value.substring(cursor), cursor + insertion.length)
}
