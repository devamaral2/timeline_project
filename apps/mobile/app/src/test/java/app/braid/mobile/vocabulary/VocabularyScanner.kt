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

    /** Troca comentários e literais por espaços, mantendo as quebras de linha para a contagem. */
    private fun blankOutNonCode(source: String): String {
        val out = StringBuilder(source.length)
        var i = 0
        while (i < source.length) {
            val rest = source.substring(i)
            val end =
                when {
                    rest.startsWith("//") -> rest.indexOf('\n').let { if (it < 0) rest.length else it }
                    rest.startsWith("/*") -> rest.indexOf("*/").let { if (it < 0) rest.length else it + 2 }
                    rest.startsWith("\"\"\"") -> rest.indexOf("\"\"\"", 3).let { if (it < 0) rest.length else it + 3 }
                    rest.startsWith("\"") -> endOfQuoted(rest, '"')
                    rest.startsWith("'") -> endOfQuoted(rest, '\'')
                    else -> 0
                }
            if (end == 0) {
                out.append(source[i])
                i++
            } else {
                rest.substring(0, end).forEach { out.append(if (it == '\n') '\n' else ' ') }
                i += end
            }
        }
        return out.toString()
    }

    private fun endOfQuoted(
        rest: String,
        quote: Char,
    ): Int {
        var i = 1
        while (i < rest.length) {
            when (rest[i]) {
                '\\' -> i++
                quote -> return i + 1
                '\n' -> return i
            }
            i++
        }
        return rest.length
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
