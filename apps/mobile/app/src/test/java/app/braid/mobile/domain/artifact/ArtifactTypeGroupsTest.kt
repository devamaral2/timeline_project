package app.braid.mobile.domain.artifact

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Os dois grupos de tipo: texto livre (lido e editado como nota) e tipos com corpo em markdown (texto livre e roteador). */
class ArtifactTypeGroupsTest {
    @Test
    fun `texto livre e so o texto hoje`() {
        assertEquals(setOf(ArtifactType.Text), FREE_TEXT_ARTIFACT_TYPES)
        assertTrue(ArtifactType.Text.isFreeText)
        ArtifactType.entries.filter { it != ArtifactType.Text }.forEach { assertFalse(it.code, it.isFreeText) }
    }

    @Test
    fun `corpo em markdown e o texto livre mais o roteador`() {
        assertEquals(setOf(ArtifactType.Text, ArtifactType.Router), TEXT_BODY_ARTIFACT_TYPES)
        assertTrue(ArtifactType.Text.hasTextBody)
        assertTrue(ArtifactType.Router.hasTextBody)
        ArtifactType.entries
            .filter { it != ArtifactType.Text && it != ArtifactType.Router }
            .forEach { assertFalse(it.code, it.hasTextBody) }
    }

    @Test
    fun `o roteador tem corpo mas nao e de texto livre`() {
        assertTrue(ArtifactType.Router.hasTextBody)
        assertFalse(ArtifactType.Router.isFreeText)
    }
}
