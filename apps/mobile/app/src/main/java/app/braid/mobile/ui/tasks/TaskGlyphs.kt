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

/** O nome curto do status de agente, o de `agentStatusNames` do web ("Na fila"); o status desconhecido não tem. */
fun agentStatusLabel(status: TaskStatus?): String? =
    when (status) {
        TaskStatus.Preparing -> "Preparando"
        TaskStatus.Queued -> "Na fila"
        TaskStatus.Starting -> "Iniciando"
        TaskStatus.Running -> "Trabalhando"
        TaskStatus.Waiting -> "Esperando"
        TaskStatus.AwaitingTranscription -> "Esperando transcrição"
        TaskStatus.Completed -> "Concluído"
        TaskStatus.Interrupted -> "Interrompido"
        TaskStatus.Failed -> "Falhou"
        TaskStatus.Cancelled -> "Cancelado"
        TaskStatus.RolledBack -> "Revertido"
        else -> null
    }

/** O nome que o leitor de tela anuncia para o glifo: o de `taskStatusName` do web. */
fun taskStatusName(
    actor: TaskActor,
    status: TaskStatus?,
): String =
    if (actor == TaskActor.Agent) {
        // O status desconhecido não tem nome próprio: o leitor de tela só diz quem executa.
        agentStatusLabel(status)?.let { "Agente, ${it.lowercase()}" } ?: "Agente"
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
            TaskStatus.Unknown -> "Tarefa"
            else -> "A fazer"
        }
    }

private const val GLYPH_STROKE = 1.75f
private const val ACTIVE_DOT_OUTLINE = 2f
private val DASHED_CIRCLE = listOf(2.4f, 2.31f)

/** A cor do glifo de pessoa por status, a do `task-glyphs.module.css`. */
@Composable
private fun glyphColor(status: TaskStatus?): Color {
    val tokens = braidTokens()
    return when (status) {
        null -> tokens.routine
        TaskStatus.Doing, TaskStatus.InHold -> tokens.warning
        TaskStatus.Done -> tokens.success
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

/**
 * O glifo do status: o de pessoa é um círculo, e o que fica dentro diz qual; tarefa de pessoa sem status é o ponto azul
 * "Só agenda". O de agente é o ícone quadrado ([AgentStatusIcon]), nos mesmos lugares em que o de pessoa seria desenhado.
 */
@Composable
fun TaskStatusGlyph(
    actor: TaskActor,
    status: TaskStatus?,
    modifier: Modifier = Modifier,
    size: Dp = 22.dp,
) {
    if (actor == TaskActor.Agent) {
        AgentStatusIcon(status = status, modifier = modifier, size = size)
        return
    }
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
                    TaskStatus.Doing -> add(SvgPart("M12 6a6 6 0 0 1 0 12Z", fill = true))
                    TaskStatus.InHold -> {
                        add(SvgPart("M10 9v6"))
                        add(SvgPart("M14 9v6"))
                    }
                    TaskStatus.Done -> add(SvgPart("m8.5 12.2 2.4 2.4 4.6-4.9"))
                    TaskStatus.Cancel -> {
                        add(SvgPart("m9.5 9.5 5 5"))
                        add(SvgPart("m14.5 9.5-5 5"))
                    }
                    TaskStatus.Missed -> add(SvgPart("m9 15 6-6"))
                    else -> Unit
                }
                if (status == TaskStatus.Doing) {
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
