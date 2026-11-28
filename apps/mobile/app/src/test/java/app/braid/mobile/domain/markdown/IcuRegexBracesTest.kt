package app.braid.mobile.domain.markdown

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * O Android compila regex com o ICU, que recusa chave solta: `\{#(t-\d+)}` passa no Java destes testes e derruba o app
 * no aparelho (`PatternSyntaxException` na inicialização do arquivo, que fecha o app ao abrir qualquer markdown). Fora de
 * uma classe de caracteres, `{` só abre quantificador (`{2}`, `{1,3}`, `{2,}`) e `}` só o fecha; o resto vai escapado.
 * A varredura olha o texto de cada `Regex("…")` do app.
 */
class IcuRegexBracesTest {
    @Test
    fun `no regex in the app has a loose brace`() {
        val violations =
            File("src/main/java")
                .walkTopDown()
                .filter { it.extension == "kt" }
                .flatMap { file ->
                    file.readLines().withIndex().flatMap { (index, line) ->
                        REGEX_LITERAL.findAll(line).mapNotNull { literal ->
                            looseBrace(patternOf(literal.groupValues[1]))?.let { "${file.path}:${index + 1} ${literal.value}" }
                        }
                    }
                }.toList()

        assertTrue("Chave solta em regex (o ICU do Android recusa):\n${violations.joinToString("\n")}", violations.isEmpty())
    }

    @Test
    fun `the check catches the brace that crashed the summaries`() {
        assertEquals(11, looseBrace("^\\{#(t-\\d+)}[ \\t]*"))
        assertEquals(null, looseBrace("^\\{#(t-\\d+)\\}[ \\t]*"))
        assertEquals(null, looseBrace("\\d{1,3}:\\d{2}(?::\\d{2,})?[{}]"))
        assertEquals(1, looseBrace("a{b}"))
        assertEquals(null, looseBrace("[\\p{L}\\p{N}]+|\\p{M}|\\x{FEFF}"))
    }

    private companion object {
        val REGEX_LITERAL = Regex("Regex\\(\\s*\"((?:\\\\.|[^\"\\\\])*)\"")
        val QUANTIFIER = Regex("^\\{\\d+(,\\d*)?\\}")
        val BRACED_ESCAPES = setOf('p', 'P', 'x', 'N')
        val INTERPOLATION = Regex("\\$(\\{[^}]*\\}|[A-Za-z_][A-Za-z0-9_]*)")

        /** O texto da regex como o Kotlin o entrega: escapes da string resolvidos e interpolações fora. */
        fun patternOf(source: String): String =
            source
                .replace(INTERPOLATION, "")
                .replace(Regex("\\\\(.)")) {
                    when (val escaped = it.groupValues[1]) {
                        "t" -> "\t"
                        "n" -> "\n"
                        "r" -> "\r"
                        else -> escaped
                    }
                }

        /** A posição da primeira chave que não é quantificador nem está escapada ou numa classe, ou `null`. */
        fun looseBrace(pattern: String): Int? {
            var index = 0
            var inClass = false
            while (index < pattern.length) {
                val char = pattern[index]
                when {
                    char == '\\' -> {
                        index++
                        // `\p{L}`, `\P{M}`, `\x{FEFF}` e `\N{…}` levam a chave junto.
                        if (pattern.getOrNull(index) in BRACED_ESCAPES && pattern.getOrNull(index + 1) == '{') {
                            index = pattern.indexOf('}', index).takeIf { it >= 0 } ?: return index
                        }
                    }
                    inClass -> if (char == ']') inClass = false
                    char == '[' -> inClass = true
                    char == '{' -> {
                        val quantifier = QUANTIFIER.find(pattern.substring(index)) ?: return index
                        index += quantifier.value.length - 1
                    }
                    char == '}' -> return index
                }
                index++
            }
            return null
        }
    }
}
