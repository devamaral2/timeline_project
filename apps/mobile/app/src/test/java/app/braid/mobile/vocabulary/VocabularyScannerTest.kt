package app.braid.mobile.vocabulary

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VocabularyScannerTest {
    private fun scan(
        source: String,
        allowed: Set<String> = emptySet(),
    ) = VocabularyScanner(allowedIdentifiers = allowed).scan("Sample.kt", source)

    @Test
    fun `flags the old entity names used as identifiers`() {
        val source =
            """
            class EventRepository
            val note: Note = loadNote()
            fun listNotas() = Unit
            val eventos = emptyList<String>()
            """.trimIndent()

        assertEquals(
            listOf("EventRepository", "note", "Note", "loadNote", "listNotas", "eventos"),
            scan(source).map { it.identifier },
        )
    }

    @Test
    fun `reports the file and the line of each violation`() {
        val violation = scan("val ok = 1\n\nclass NoteScreen").single()

        assertEquals("Sample.kt", violation.file)
        assertEquals(3, violation.line)
    }

    @Test
    fun `accepts the new vocabulary`() {
        val source =
            """
            class TaskRepository
            data class Artifact(val id: String)
            val request: Request = Request()
            fun showNotification() = Unit
            val subtask = "x"
            """.trimIndent()

        assertTrue(scan(source).isEmpty())
    }

    @Test
    fun `lets Nota and Evento appear as screen labels in strings`() {
        val source =
            """
            val label = "Nota"
            val raw = ${"\"\"\""}Evento da nota${"\"\"\""}
            val char = 'e'
            """.trimIndent()

        assertTrue(scan(source).isEmpty())
    }

    @Test
    fun `ignores comments, package and import lines`() {
        val source =
            """
            package app.braid.mobile.event
            import android.view.MotionEvent
            // a nota antiga virou artefato
            /* Event
               Note */
            val task = 1
            """.trimIndent()

        assertTrue(scan(source).isEmpty())
    }

    @Test
    fun `lets platform types through only when they are allowed explicitly`() {
        val source = "fun on(event: MotionEvent) = Unit"

        assertEquals(listOf("event", "MotionEvent"), scan(source).map { it.identifier })
        assertEquals(listOf("event"), scan(source, allowed = setOf("MotionEvent")).map { it.identifier })
    }

    @Test(timeout = 10_000)
    fun `a large file is scanned in linear time and still finds the violation at its end`() {
        val filler = "val value = \"texto\" // comentário com nota e evento\n".repeat(20_000)

        val found = scan(filler + "class EventRepository\n")

        assertEquals(listOf("EventRepository"), found.map { it.identifier })
        assertEquals(20_001, found.single().line)
    }
}
