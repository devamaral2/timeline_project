package app.braid.mobile.ui.tasks

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.domain.task.TaskSituation

/** O nome da situação, na tela e para o leitor de tela: o `situationNames` do web. Uma situação que o app não conhece só diz "Situação". */
fun situationName(situation: TaskSituation): String =
    when (situation) {
        TaskSituation.ToReview -> "Para revisar"
        TaskSituation.Reviewed -> "Revisada"
        TaskSituation.Bookmarked -> "Guardada"
        TaskSituation.Unknown -> "Situação"
    }

private const val SITUATION_STROKE = 1.75f

/** A cor da situação, a de `task-glyphs.module.css`: apagada, sucesso e informação (o azul de `routine`). */
@Composable
private fun situationColor(situation: TaskSituation): Color =
    when (situation) {
        TaskSituation.Reviewed -> braidTokens().success
        TaskSituation.Bookmarked -> braidTokens().routine
        TaskSituation.ToReview, TaskSituation.Unknown -> MaterialTheme.colorScheme.onSurfaceVariant
    }

/**
 * O glifo da situação, no desenho do web: Para revisar é o círculo vazio de "A fazer", Revisada é um círculo com dois
 * vistos e Guardada, um marcador. [description] é o que o leitor de tela anuncia; o padrão é o nome da situação.
 */
@Composable
fun TaskSituationGlyph(
    situation: TaskSituation,
    modifier: Modifier = Modifier,
    size: Dp = 22.dp,
    description: String = situationName(situation),
) {
    val parts =
        remember(situation) {
            buildList {
                if (situation == TaskSituation.Bookmarked) {
                    add(SvgPart("m18 20.5-6-3.8-6 3.8V5.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z"))
                } else {
                    add(SvgPart(svgCircle(12f, 12f, 9f)))
                }
                if (situation == TaskSituation.Reviewed) {
                    add(SvgPart("m6.6 12.4 2.2 2.2 4.4-4.7"))
                    add(SvgPart("M12.3 14.6l4.5-4.8"))
                }
            }
        }
    SvgIcon(
        parts = parts,
        size = size,
        color = situationColor(situation),
        strokeWidth = SITUATION_STROKE,
        modifier = modifier.clearAndSetSemantics { contentDescription = description },
    )
}
