package app.braid.mobile.domain.artifact

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Os dois grupos de tipo: texto livre (lido e editado como o texto) e tipos com corpo em markdown (texto livre e roteador). */
class ArtifactTypeGroupsTest {
    private val freeText =
        setOf(ArtifactType.Text, ArtifactType.News, ArtifactType.EmailSummary, ArtifactType.YoutubeTranscript)

    @Test
    fun `texto livre e o texto as noticias o resumo de email e a transcricao`() {
        assertEquals(freeText, FREE_TEXT_ARTIFACT_TYPES)
        freeText.forEach { assertTrue(it.code, it.isFreeText) }
        ArtifactType.known.filter { it !in freeText }.forEach { assertFalse(it.code, it.isFreeText) }
    }

    @Test
    fun `corpo em markdown e o texto livre mais o roteador`() {
        assertEquals(freeText + ArtifactType.Router, TEXT_BODY_ARTIFACT_TYPES)
        (freeText + ArtifactType.Router).forEach { assertTrue(it.code, it.hasTextBody) }
        ArtifactType.known
            .filter { it !in freeText && it != ArtifactType.Router }
            .forEach { assertFalse(it.code, it.hasTextBody) }
    }

    @Test
    fun `o roteador tem corpo mas nao e de texto livre`() {
        assertTrue(ArtifactType.Router.hasTextBody)
        assertFalse(ArtifactType.Router.isFreeText)
    }

    @Test
    fun `os tipos novos sao lidos pelo codigo do contrato e ficam com a pessoa`() {
        assertEquals(ArtifactType.News, ArtifactType.fromCode("news"))
        assertEquals(ArtifactType.EmailSummary, ArtifactType.fromCode("email_summary"))
        assertEquals(ArtifactType.YoutubeTranscript, ArtifactType.fromCode("youtube_transcript"))
        listOf(ArtifactType.News, ArtifactType.EmailSummary, ArtifactType.YoutubeTranscript).forEach {
            assertEquals(it.code, app.braid.mobile.domain.task.TaskActor.Human, artifactActor(it))
        }
    }

    @Test
    fun `a code the app does not know becomes the unknown type, which is outside the contract list and every group`() {
        assertEquals(ArtifactType.Unknown, ArtifactType.fromCode("hologram"))
        assertEquals(ArtifactType.Unknown, ArtifactType.fromCode(""))
        assertFalse(ArtifactType.Unknown in ArtifactType.known)
        assertEquals(ArtifactType.entries - ArtifactType.Unknown, ArtifactType.known)
        assertFalse(ArtifactType.Unknown.isFreeText)
        assertFalse(ArtifactType.Unknown.hasTextBody)
        assertTrue(ArtifactType.Unknown.showsBody)
        assertEquals("Artefato", artifactTypeLabel(ArtifactType.Unknown))
        assertEquals(app.braid.mobile.domain.task.TaskActor.Human, artifactActor(ArtifactType.Unknown))
        ArtifactType.known.forEach { assertEquals(it, ArtifactType.fromCode(it.code)) }
    }

    @Test
    fun `an unknown type shows the markdown of its body, and nothing without one`() {
        val now = java.time.Instant.parse("2026-09-14T15:00:00Z")

        fun unknown(data: ArtifactData) = Artifact("a", "Mapa", ArtifactType.Unknown, data, false, emptyList(), 1, now, now)

        assertEquals("Texto", markdownBodyOf(unknown(TextData("# Mapa\n\nTexto"))))
        assertEquals("", markdownBodyOf(unknown(UnknownData)))
    }
}
