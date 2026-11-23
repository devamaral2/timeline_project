package app.braid.mobile.ui.tasks

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus

/** O nome que o leitor de tela anuncia para o glifo: o de `taskStatusName` do web. */
fun taskStatusName(
    actor: TaskActor,
    status: TaskStatus?,
): String =
    if (actor == TaskActor.Agent) {
        when (status) {
            TaskStatus.Queued -> "Agente, na fila"
            TaskStatus.Running -> "Agente, executando"
            TaskStatus.Waiting -> "Agente, aguardando você"
            TaskStatus.Done -> "Agente, feito"
            TaskStatus.Failed -> "Agente, falhou"
            TaskStatus.Cancel -> "Agente, cancelado"
            else -> "Agente"
        }
    } else {
        when (status) {
            null -> "Só agenda"
            TaskStatus.Todo -> "A fazer"
            TaskStatus.ToDefine -> "Sem data"
            TaskStatus.Doing -> "Em curso"
            TaskStatus.InHold -> "Em espera"
            TaskStatus.Done -> "Feito"
            TaskStatus.Cancel -> "Cancelado"
            TaskStatus.Missed -> "Não realizado"
            else -> "A fazer"
        }
    }

private const val GLYPH_STROKE = 1.75f
private const val ACTIVE_DOT_OUTLINE = 2f
private val DASHED_CIRCLE = listOf(2.4f, 2.31f)

/** A cor do glifo por status, a do `task-glyphs.module.css`. */
@Composable
private fun glyphColor(status: TaskStatus?): Color {
    val tokens = braidTokens()
    return when (status) {
        null -> tokens.routine
        TaskStatus.Doing, TaskStatus.InHold, TaskStatus.Running, TaskStatus.Waiting -> tokens.warning
        TaskStatus.Done -> tokens.success
        TaskStatus.Failed -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

/**
 * O glifo do status: um círculo, e o que fica dentro diz qual. Tarefa de pessoa
 * sem status é o ponto azul "Só agenda"; os status de agente usam o mesmo
 * contorno e o "executando" ganha o ponto verde-água.
 */
@Composable
fun TaskStatusGlyph(
    actor: TaskActor,
    status: TaskStatus?,
    modifier: Modifier = Modifier,
    size: Dp = 22.dp,
) {
    val color = glyphColor(status)
    val background = MaterialTheme.colorScheme.background
    val brand = braidTokens().brand
    val parts =
        remember(status, color, background, brand) {
            buildList {
                if (status == null) {
                    add(SvgPart(svgCircle(12f, 12f, 4.5f), fill = true))
                } else {
                    add(SvgPart(svgCircle(12f, 12f, 9f), dash = DASHED_CIRCLE.takeIf { status == TaskStatus.ToDefine }))
                }
                when (status) {
                    TaskStatus.Doing, TaskStatus.Running -> add(SvgPart("M12 6a6 6 0 0 1 0 12Z", fill = true))
                    TaskStatus.InHold, TaskStatus.Waiting -> {
                        add(SvgPart("M10 9v6"))
                        add(SvgPart("M14 9v6"))
                    }
                    TaskStatus.Done -> add(SvgPart("m8.5 12.2 2.4 2.4 4.6-4.9"))
                    TaskStatus.Failed -> {
                        add(SvgPart("M12 8v5"))
                        add(SvgPart("M12 16.2h.01"))
                    }
                    TaskStatus.Cancel -> {
                        add(SvgPart("m9.5 9.5 5 5"))
                        add(SvgPart("m14.5 9.5-5 5"))
                    }
                    TaskStatus.Missed -> add(SvgPart("m9 15 6-6"))
                    else -> Unit
                }
                if (status == TaskStatus.Doing || status == TaskStatus.Running) {
                    add(
                        SvgPart(
                            svgCircle(19f, 5f, 3f),
                            fill = true,
                            color = brand,
                            outline = background,
                            outlineWidth = ACTIVE_DOT_OUTLINE,
                        ),
                    )
                }
            }
        }
    SvgIcon(
        parts = parts,
        size = size,
        color = color,
        strokeWidth = GLYPH_STROKE,
        modifier = modifier.clearAndSetSemantics { contentDescription = taskStatusName(actor, status) },
    )
}

/** O ícone do tipo com o código escrito em mono ao lado; o código é o que o leitor de tela anuncia. */
@Composable
fun TaskKindMark(
    kind: TaskKind,
    modifier: Modifier = Modifier,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
        SvgIcon(BraidIcons.taskKind(kind.code), size = 14.dp, color = muted, modifier = Modifier.clearAndSetSemantics {})
        Spacer(Modifier.width(6.dp))
        Text(text = kind.code, color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 1)
    }
}
