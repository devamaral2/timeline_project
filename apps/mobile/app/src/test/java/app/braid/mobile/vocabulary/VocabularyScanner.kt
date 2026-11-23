package app.braid.mobile.vocabulary

data class VocabularyViolation(
    val file: String,
    val line: Int,
    val identifier: String,
)

/**
 * Procura, no código Kotlin, identificadores que chamam uma entidade de evento
 * ou de nota. Comentários, strings, `package` e `import` ficam de fora: o
 * rótulo "Nota" na tela é permitido.
 */
class VocabularyScanner(
    private val allowedIdentifiers: Set<String> = emptySet(),
) {
    fun scan(
        file: String,
        source: String,
    ): List<VocabularyViolation> =
        blankOutNonCode(source)
            .lineSequence()
            .withIndex()
            .filterNot { (_, text) -> text.trimStart().let { it.startsWith("package ") || it.startsWith("import ") } }
            .flatMap { (index, text) ->
                IDENTIFIER
                    .findAll(text)
                    .map { it.value }
                    .filter { it !in allowedIdentifiers && words(it).any { word -> word in FORBIDDEN_WORDS } }
                    .map { VocabularyViolation(file, index + 1, it) }
            }.toList()

    /** Troca comentários e literais por espaços, mantendo as quebras de linha para a contagem. Uma passada só. */
    private fun blankOutNonCode(source: String): String {
        val out = StringBuilder(source.length)
        var i = 0
        while (i < source.length) {
            val end =
                when {
                    source.startsWith("//", i) -> source.indexOf('\n', i).let { if (it < 0) source.length else it }
                    source.startsWith("/*", i) -> source.indexOf("*/", i).let { if (it < 0) source.length else it + 2 }
                    source.startsWith("\"\"\"", i) -> source.indexOf("\"\"\"", i + 3).let { if (it < 0) source.length else it + 3 }
                    source[i] == '"' -> endOfQuoted(source, i, '"')
                    source[i] == '\'' -> endOfQuoted(source, i, '\'')
                    else -> i
                }
            if (end == i) {
                out.append(source[i])
                i++
            } else {
                for (j in i until end) out.append(if (source[j] == '\n') '\n' else ' ')
                i = end
            }
        }
        return out.toString()
    }

    /** Onde o literal que abre em [start] termina (exclusivo): na aspa que fecha, na quebra de linha ou no fim do texto. */
    private fun endOfQuoted(
        source: String,
        start: Int,
        quote: Char,
    ): Int {
        var i = start + 1
        while (i < source.length) {
            when (source[i]) {
                '\\' -> i++
                quote -> return i + 1
                '\n' -> return i
            }
            i++
        }
        return source.length
    }

    private fun words(identifier: String): List<String> =
        identifier
            .split('_')
            .flatMap { CAMEL_WORD.findAll(it).map { match -> match.value.lowercase() }.toList() }

    private companion object {
        val IDENTIFIER = Regex("[A-Za-z_][A-Za-z0-9_]*")
        val CAMEL_WORD = Regex("[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+")
        val FORBIDDEN_WORDS = setOf("event", "events", "evento", "eventos", "note", "notes", "nota", "notas")
    }
}
