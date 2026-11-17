package app.braid.mobile.vocabulary

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A ADR 0015 trocou evento e nota por tarefa e artefato. O app nasce no
 * vocabulário novo e esta varredura impede que os nomes antigos voltem como
 * nome de entidade. "Nota" continua valendo como rótulo de tela, dentro de
 * uma string.
 */
class AppVocabularyTest {
    @Test
    fun `no source file names an entity event or note`() {
        val scanner = VocabularyScanner(allowedIdentifiers = PLATFORM_TYPES)
        val roots = listOf(File("src/main/java"), File("src/test/java"))

        val violations =
            roots
                .filter { it.exists() }
                .flatMap { root -> root.walkTopDown().filter { it.extension == "kt" }.toList() }
                .filterNot { it.parentFile?.name == "vocabulary" }
                .flatMap { scanner.scan(it.path, it.readText()) }

        assertTrue(
            "Nomes antigos no código: ${violations.joinToString { "${it.file}:${it.line} ${it.identifier}" }}",
            violations.isEmpty(),
        )
    }

    private companion object {
        /** Nomes de bibliotecas e da plataforma Android que carregam "Event" e não são entidade do domínio. */
        val PLATFORM_TYPES =
            setOf(
                "MotionEvent",
                "KeyEvent",
                // Turbine
                "cancelAndIgnoreRemainingEvents",
                "cancelAndConsumeRemainingEvents",
                "expectNoEvents",
                "awaitEvent",
            )
    }
}
