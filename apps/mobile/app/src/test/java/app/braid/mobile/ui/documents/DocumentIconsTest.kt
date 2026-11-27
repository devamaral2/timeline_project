package app.braid.mobile.ui.documents

import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.editEntityTypeOfArtifact
import app.braid.mobile.domain.request.entityKindLabel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Os desenhos dos tipos de artefato: os traçados são os mesmos do web, e o tipo desconhecido cai na folha de texto. */
class DocumentIconsTest {
    @Test
    fun `the new types draw with the paths the web uses`() {
        assertEquals(
            listOf(
                "M4 5.5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z",
                "M17 9.5h2.5a1.5 1.5 0 0 1 1.5 1.5v7.5a2 2 0 0 1-2 2",
                "M7.5 9h6",
                "M7.5 12.5h6",
                "M7.5 16h3.5",
            ),
            DocumentIcons.glyph(ArtifactType.News).map { it.pathData },
        )
        assertEquals(
            listOf(
                "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
                "M3.5 7.5l8.5 6 8.5-6",
            ),
            DocumentIcons.glyph(ArtifactType.EmailSummary).map { it.pathData },
        )
        assertEquals(
            listOf(
                "M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 " +
                    "2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17",
                "m10 15 5-3-5-3z",
            ),
            DocumentIcons.glyph(ArtifactType.YoutubeTranscript).map { it.pathData },
        )
    }

    @Test
    fun `the text keeps its letter and the unknown type uses it too`() {
        assertEquals(DocumentIcons.letterA, DocumentIcons.glyph(ArtifactType.Text))
        assertEquals(DocumentIcons.letterA, DocumentIcons.glyph(ArtifactType.Unknown))
        listOf(ArtifactType.News, ArtifactType.EmailSummary, ArtifactType.YoutubeTranscript).forEach {
            assertNotEquals(it.code, DocumentIcons.letterA, DocumentIcons.glyph(it))
        }
    }

    @Test
    fun `the produced list shows the type icon, or the text sheet when the type is missing, plain or unknown`() {
        assertEquals(DocumentIcons.newspaper, DocumentIcons.producedGlyph(ArtifactType.News))
        assertEquals(DocumentIcons.letter, DocumentIcons.producedGlyph(ArtifactType.EmailSummary))
        assertEquals(DocumentIcons.youtube, DocumentIcons.producedGlyph(ArtifactType.YoutubeTranscript))
        assertEquals(DocumentIcons.glyph(ArtifactType.Router), DocumentIcons.producedGlyph(ArtifactType.Router))
        assertEquals(BraidIcons.fileText, DocumentIcons.producedGlyph(null))
        assertEquals(BraidIcons.fileText, DocumentIcons.producedGlyph(ArtifactType.Text))
        assertEquals(BraidIcons.fileText, DocumentIcons.producedGlyph(ArtifactType.Unknown))
    }

    @Test
    fun `a produced artifact of an unknown type is labelled as a generic artifact`() {
        fun entity(type: ArtifactType?) = RequestEntity(EntityKind.Artifact, "a", "Mapa", type, RequestOperation.Create)
        assertEquals("Notícias", entityKindLabel(entity(ArtifactType.News)))
        assertEquals("Artefato", entityKindLabel(entity(ArtifactType.fromCode("hologram"))))
    }

    @Test
    fun `an unknown type has no AI edit bar`() {
        assertNull(editEntityTypeOfArtifact(ArtifactType.Unknown, global = false))
    }
}
