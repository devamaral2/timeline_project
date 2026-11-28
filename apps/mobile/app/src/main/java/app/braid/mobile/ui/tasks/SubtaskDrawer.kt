package app.braid.mobile.ui.tasks

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.task.SubtaskTree
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.cardIsOverdue
import app.braid.mobile.domain.task.cardWhenLabel
import app.braid.mobile.domain.task.countsAsDone
import app.braid.mobile.domain.task.isClosedStatus
import java.time.Instant

/** O rótulo de `cardWhenLabel` para quem não tem dia: na gaveta ele só repetiria ruído. */
private const val NO_DATE = "Sem data"

/** Quantas das subtarefas diretas estão feitas, cada uma pelo seu executor. */
fun subtasksDone(subtasks: List<TaskCard>): Int = subtasks.count { countsAsDone(it.actor, it.status) }

/** O texto do topo do fio: "1 de 4 feitas"; com uma subtarefa só, "0 de 1 feita". */
fun subtaskProgressText(subtasks: List<TaskCard>): String =
    "${subtasksDone(subtasks)} de ${subtasks.size} ${if (subtasks.size == 1) "feita" else "feitas"}"

/** O que o leitor de tela anuncia no botão que abre e fecha a gaveta. */
fun subtaskToggleLabel(
    parentName: String,
    subtasks: List<TaskCard>,
): String = "Subtarefas de “$parentName”: ${subtaskProgressText(subtasks)}"

/** O nome da lista da gaveta. */
fun subtaskDrawerLabel(parentName: String): String = "Subtarefas de “$parentName”"

/** O que o leitor de tela anuncia no glifo de uma subtarefa de pessoa. */
fun subtaskGlyphLabel(card: TaskCard): String = "${taskStatusName(card.actor, card.status)}. Mudar status de “${card.name}”"

/** O quando que a gaveta mostra: nada quando seria "Sem data". */
fun subtaskWhenLabel(
    card: TaskCard,
    now: Instant,
): String? = cardWhenLabel(card, now).takeUnless { it == NO_DATE }

/**
 * O topo do fio: a pizza das feitas, "1 de 4 feitas" e a seta, ligados à principal pelo cotovelo. Abre e fecha as
 * subtarefas logo abaixo.
 */
@Composable
private fun SubtaskToggle(
    card: TaskCard,
    subtasks: List<TaskCard>,
    expanded: Boolean,
    riseToGlyph: Dp,
    onToggle: () -> Unit,
) {
    val done = subtasksDone(subtasks)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val wire = MaterialTheme.colorScheme.outline
    val success = braidTokens().success
    val label = subtaskToggleLabel(card.name, subtasks)
    Row(
        Modifier
            .fillMaxWidth()
            .height(TOGGLE_HEIGHT)
            .drawBehind {
                // Aberta, o fio passa por aqui e segue até as subtarefas; fechada, termina no cotovelo.
                val x = 0.5.dp.toPx()
                val elbowEnd = TOGGLE_HEIGHT.toPx() / 2
                val bottom = if (expanded) size.height else elbowEnd - ELBOW_RADIUS.toPx()
                drawLine(wire, Offset(x, -riseToGlyph.toPx()), Offset(x, bottom), strokeWidth = 1.dp.toPx())
                drawPath(
                    elbowPath(ELBOW_WIDTH.toPx(), elbowEnd, ELBOW_RADIUS.toPx()),
                    wire,
                    style = Stroke(width = 1.dp.toPx()),
                )
            }.semantics {
                role = Role.Button
                contentDescription = label
                stateDescription = if (expanded) "Aberto" else "Recolhido"
            }.clickable(role = Role.Button, onClick = onToggle)
            .padding(start = LINE_START),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Canvas(Modifier.size(14.dp)) {
            val stroke = 2.4.dp.toPx()
            val radius = 5.dp.toPx()
            val topLeft = Offset(center.x - radius, center.y - radius)
            val arc = Size(radius * 2, radius * 2)
            drawCircle(wire, radius = radius, style = Stroke(width = stroke))
            if (done > 0) {
                drawArc(
                    color = success,
                    startAngle = -90f,
                    sweepAngle = 360f * done / subtasks.size,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arc,
                    style = Stroke(width = stroke, cap = StrokeCap.Butt),
                )
            }
        }
        Text(
            text = subtaskProgressText(subtasks),
            modifier = Modifier.clearAndSetSemantics {},
            color = muted,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            maxLines = 1,
        )
        SvgIcon(
            BraidIcons.chevronDown,
            size = 12.dp,
            color = muted,
            strokeWidth = 2.2f,
            modifier = Modifier.rotate(if (expanded) 180f else 0f).clearAndSetSemantics {},
        )
    }
}

/** O fio do cotovelo (16×20 dp): desce da esquerda, faz a curva de 9 dp e segue para a direita. */
private fun elbowPath(
    widthPx: Float,
    heightPx: Float,
    radiusPx: Float,
): Path =
    Path().apply {
        moveTo(0f, 0f)
        lineTo(0f, heightPx - radiusPx)
        quadraticTo(0f, heightPx, radiusPx, heightPx)
        lineTo(widthPx, heightPx)
    }

private val ELBOW_WIDTH = 16.dp
private val ELBOW_HEIGHT = 20.dp
private val ELBOW_RADIUS = 9.dp
private val LINE_START = 24.dp
private val GLYPH_TOUCH = 36.dp
private val TOGGLE_HEIGHT = 44.dp

/**
 * A gaveta: presa ao glifo da principal por um fio, com a linha das feitas no topo ([SubtaskToggle]) e, quando aberta,
 * as subtarefas diretas de [parent]. Cada uma tem à esquerda o glifo (o de pessoa abre a mesma escolha de status da
 * lista; na de agente, um ponto inerte), o nome que leva ao detalhe, o quando, na de agente o ícone quadrado do status
 * na extrema direita e, se tiver as suas, a própria gaveta logo abaixo. [closedIds] são as tarefas com a
 * gaveta fechada.
 */
@Composable
fun SubtaskDrawer(
    parent: TaskCard,
    tree: SubtaskTree,
    now: Instant,
    closedIds: Set<String>,
    onToggle: (String) -> Unit,
    onStatusClick: (TaskCard) -> Unit,
    onOpenTask: (String) -> Unit,
    modifier: Modifier = Modifier,
    /** Quanto o fio da gaveta sobe até o glifo da principal. */
    riseToGlyph: Dp = 22.dp,
) {
    val items = tree.subtasksOf(parent.id)
    val expanded = parent.id !in closedIds
    val wire = MaterialTheme.colorScheme.outline
    Column(modifier.fillMaxWidth()) {
        SubtaskToggle(
            card = parent,
            subtasks = items,
            expanded = expanded,
            riseToGlyph = riseToGlyph,
            onToggle = { onToggle(parent.id) },
        )
        if (!expanded) return@Column
        Column(Modifier.fillMaxWidth().semantics { contentDescription = subtaskDrawerLabel(parent.name) }) {
            items.forEachIndexed { index, card ->
                val last = index == items.lastIndex
                Column(
                    Modifier.drawBehind {
                        val x = 0.5.dp.toPx()
                        // O fio segue até a subtarefa seguinte, passando pela gaveta aninhada; a última termina no cotovelo.
                        val bottom = if (last) ELBOW_HEIGHT.toPx() - ELBOW_RADIUS.toPx() else size.height
                        drawLine(wire, Offset(x, 0f), Offset(x, bottom), strokeWidth = 1.dp.toPx())
                    },
                ) {
                    SubtaskLine(card = card, now = now, onStatusClick = onStatusClick, onOpenTask = onOpenTask)
                    if (tree.subtasksOf(card.id).isNotEmpty()) {
                        SubtaskDrawer(
                            parent = card,
                            tree = tree,
                            now = now,
                            closedIds = closedIds,
                            onToggle = onToggle,
                            onStatusClick = onStatusClick,
                            onOpenTask = onOpenTask,
                            modifier = Modifier.padding(start = 33.dp),
                            riseToGlyph = 11.dp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SubtaskLine(
    card: TaskCard,
    now: Instant,
    onStatusClick: (TaskCard) -> Unit,
    onOpenTask: (String) -> Unit,
) {
    val isAgent = card.actor == TaskActor.Agent
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val wire = MaterialTheme.colorScheme.outline
    // Fechada (feita, cancelada, não realizada ou falha): o nome sai riscado no tom apagado.
    val closed = isClosedStatus(card.actor, card.status)
    val whenLabel = subtaskWhenLabel(card, now)
    val overdue = cardIsOverdue(card, now)
    Row(
        Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 40.dp)
            .drawBehind {
                drawPath(
                    elbowPath(ELBOW_WIDTH.toPx(), ELBOW_HEIGHT.toPx(), ELBOW_RADIUS.toPx()),
                    wire,
                    style = Stroke(width = 1.dp.toPx()),
                )
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // O glifo de 18 dp tem o centro a 33 dp do fio; a área de toque de 36 dp passa por cima da margem.
        Spacer(Modifier.width(LINE_START - 9.dp))
        if (isAgent) {
            // O mesmo ponto inerte da linha principal.
            Box(Modifier.size(GLYPH_TOUCH).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
                Box(Modifier.size(4.dp).background(muted.copy(alpha = 0.4f), CircleShape))
            }
        } else {
            Box(
                Modifier
                    .size(GLYPH_TOUCH)
                    .semantics { contentDescription = subtaskGlyphLabel(card) }
                    .clickable(role = Role.Button) { onStatusClick(card) },
                contentAlignment = Alignment.Center,
            ) {
                TaskStatusGlyph(actor = card.actor, status = card.status, size = 18.dp, modifier = Modifier.clearAndSetSemantics {})
            }
        }
        Spacer(Modifier.width(1.dp))
        Text(
            text = card.name,
            modifier =
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(role = Role.Button) { onOpenTask(card.id) },
            color = if (closed) muted.copy(alpha = 0.7f) else MaterialTheme.colorScheme.onBackground,
            textDecoration = if (closed) TextDecoration.LineThrough else null,
            fontSize = 15.sp,
            lineHeight = 20.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (whenLabel != null) {
            Text(
                text = whenLabel,
                modifier = Modifier.padding(start = 10.dp),
                color = if (overdue) MaterialTheme.colorScheme.error else muted,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                maxLines = 1,
            )
        }
        if (isAgent) {
            AgentStatusIcon(status = card.status, modifier = Modifier.padding(start = 10.dp), size = 16.dp)
        }
    }
}
