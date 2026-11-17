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

/** Os desenhos dos documentos, os mesmos SVG do web (`NoteSheet.tsx` e o lucide). */
object DocumentIcons {
    /** O `FileText` do lucide: o estado vazio. */
    val fileText =
        listOf(
            SvgPart("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"),
            SvgPart("M14 2v4a2 2 0 0 0 2 2h4"),
            SvgPart("M10 9H8"),
            SvgPart("M16 13H8"),
            SvgPart("M16 17H8"),
        )

    /** A letra A da nota de texto, a traço na grade de 24. */
    val letterA = listOf(SvgPart("m4.5 20 7.5-16 7.5 16"), SvgPart("M7.3 14h9.4"))

    /** O `Route` do lucide: o roteador. */
    val route =
        listOf(
            SvgPart(svgCircle(6f, 19f, 3f)),
            SvgPart("M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"),
            SvgPart(svgCircle(18f, 5f, 3f)),
        )

    /** O ícone do tipo no meio da página: o do tipo de tarefa nas estruturadas, o do arquivo nas do Hermes, a letra no texto. */
    fun glyph(type: ArtifactType): List<SvgPart> =
        when (val visual = artifactVisualType(type)) {
            "meal", "training", "sleep" -> BraidIcons.taskKind(visual)
            "skill" -> BraidIcons.taskKind("build_request")
            "agent" -> BraidIcons.bot
            "router" -> route
            else -> letterA
        }

    /** A página da frente e a borda de cima e da direita de uma segunda, na grade de 44 da lista. */
    val sheetFront = listOf(SvgPart("M6.5 9.5h22a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4h-22a4 4 0 0 1-4-4v-26a4 4 0 0 1 4-4Z"))
    val sheetBack = listOf(SvgPart("M13 .5h24.5a4 4 0 0 1 4 4v31"))
}

private const val SHEET_GRID = 44f

/**
 * O documento como páginas empilhadas, do tamanho do quadrado da tarefa (44dp): o símbolo da aba Documentos com o
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
