package app.braid.mobile.ui.documents

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.artifactVisualType

/** Os desenhos dos artefatos, os mesmos SVG do web (`type-icons.tsx`, `NoteSheet.tsx` e o lucide). */
object DocumentIcons {
    /** A letra A da nota de texto, a traço na grade de 24. */
    val letterA = listOf(SvgPart("m4.5 20 7.5-16 7.5 16"), SvgPart("M7.3 14h9.4"))

    /** "Bússola": o roteador. */
    val compass =
        listOf(
            SvgPart(svgCircle(12f, 12f, 8.5f)),
            SvgPart("M15.75 8.25l-1.9 5.6-5.6 1.9 1.9-5.6z"),
        )

    /** "Movimento": o exercício, uma figura de braços erguidos. */
    val movement =
        listOf(
            SvgPart(svgCircle(12f, 4.5f, 2f)),
            SvgPart("M5.5 7.5l6.5 3 6.5-3"),
            SvgPart("M12 10.5V15"),
            SvgPart("M7.5 21l4.5-6 4.5 6"),
        )

    /** O ícone do tipo no meio da página: o do tipo de tarefa nas estruturadas, o do arquivo nas do Hermes, a letra no texto. */
    fun glyph(type: ArtifactType): List<SvgPart> =
        when (val visual = artifactVisualType(type)) {
            "meal", "training", "sleep" -> BraidIcons.taskKind(visual)
            "skill" -> BraidIcons.taskKind("build_request")
            "agent" -> BraidIcons.bot
            "router" -> compass
            "workout" -> movement
            else -> letterA
        }

    /** A página da frente e a borda de cima e da direita de uma segunda, na grade de 44 da lista. */
    val sheetFront = listOf(SvgPart("M6.5 9.5h22a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4h-22a4 4 0 0 1-4-4v-26a4 4 0 0 1 4-4Z"))
    val sheetBack = listOf(SvgPart("M13 .5h24.5a4 4 0 0 1 4 4v31"))
}

private const val SHEET_GRID = 44f

/**
 * O artefato como páginas empilhadas, do tamanho do quadrado da tarefa (44dp): as páginas empilhadas da lista, com o
 * ícone do tipo no meio da página da frente. Decorativo: o tipo já está escrito ao lado.
 */
@Composable
fun DocumentSheet(
    type: ArtifactType,
    modifier: Modifier = Modifier,
) {
    Box(modifier.size(44.dp).clearAndSetSemantics {}) {
        SvgIcon(
            DocumentIcons.sheetFront + DocumentIcons.sheetBack,
            size = 44.dp,
            color = MaterialTheme.colorScheme.outline,
            strokeWidth = 1f,
            grid = SHEET_GRID,
        )
        SvgIcon(
            DocumentIcons.glyph(type),
            size = 16.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            strokeWidth = 2.05f,
            modifier = Modifier.offset(x = 9.5.dp, y = 18.5.dp),
        )
    }
}
