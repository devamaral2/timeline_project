package app.braid.mobile.ui.tasks

import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.svgRect
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.ui.chat.rememberReducedMotion

/*
 * O ícone quadrado do status de agente, o de `components/tasks/agent-status-icon.tsx` do web: uma grade de 20, um quadrado de
 * canto arredondado (18 de lado, raio 5, traço 1,6) e o desenho de dentro centrado em (10, 10). O desenho, a cor e o movimento de
 * cada um dos onze status moram em [agentStatusIcon], uma tabela de dados; o composable só a pinta.
 */

/** A cor do ícone, por token: apagada, destaque, aviso, sucesso ou erro. */
enum class AgentIconTone { Muted, Accent, Warning, Success, Destructive }

/** O contorno do quadrado: tracejado em "Preparando", a 40% em "Iniciando", cheio em "Concluído". */
enum class AgentIconFrame { Plain, Dashed, Dim, Solid }

/** O que se move no ícone: o arco de "Iniciando" gira e o quadrado de "Trabalhando" pulsa. */
enum class AgentIconMotion { None, Spin, Pulse }

data class IconPoint(
    val x: Float,
    val y: Float,
)

/** Uma peça do desenho de dentro, em coordenadas da grade de 20. */
sealed interface AgentIconShape {
    /** Um ponto cheio. */
    data class Dot(
        val cx: Float,
        val cy: Float,
        val r: Float,
    ) : AgentIconShape

    /** O arco tracejado que gira em "Iniciando". */
    data class Ring(
        val cx: Float,
        val cy: Float,
        val r: Float,
    ) : AgentIconShape

    /** O anel vazio de "Esperando transcrição": só contorno, parado. */
    data class Hollow(
        val cx: Float,
        val cy: Float,
        val r: Float,
    ) : AgentIconShape

    /** O quadrado cheio que pulsa em "Trabalhando". */
    data class Pulse(
        val x: Float,
        val y: Float,
        val side: Float,
        val radius: Float,
    ) : AgentIconShape

    /** Um traço; [onSolid] pinta na cor do fundo, para o visto sobre o quadrado cheio de "Concluído". */
    data class Line(
        val points: List<IconPoint>,
        val onSolid: Boolean = false,
    ) : AgentIconShape
}

/** A caixa que o desenho de dentro ocupa, com o traço, e o centro dela. */
data class IconBounds(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    val centerX: Float get() = (left + right) / 2f
    val centerY: Float get() = (top + bottom) / 2f
}

data class AgentStatusIconSpec(
    val tone: AgentIconTone,
    val frame: AgentIconFrame,
    val inside: List<AgentIconShape>,
) {
    /** O movimento do ícone; com o sistema pedindo menos movimento, nenhum. */
    fun motion(reducedMotion: Boolean): AgentIconMotion =
        when {
            reducedMotion -> AgentIconMotion.None
            inside.any { it is AgentIconShape.Ring } -> AgentIconMotion.Spin
            inside.any { it is AgentIconShape.Pulse } -> AgentIconMotion.Pulse
            else -> AgentIconMotion.None
        }

    /** Os limites do desenho de dentro, somando metade do traço aos traços; vazio se não há nada dentro. */
    fun insideBounds(): IconBounds {
        val half = STROKE / 2f
        val boxes =
            inside.map { shape ->
                when (shape) {
                    is AgentIconShape.Dot -> IconBounds(shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r)
                    is AgentIconShape.Hollow ->
                        IconBounds(
                            shape.cx - shape.r - half,
                            shape.cy - shape.r - half,
                            shape.cx + shape.r + half,
                            shape.cy + shape.r + half,
                        )
                    is AgentIconShape.Ring ->
                        IconBounds(
                            shape.cx - shape.r - half,
                            shape.cy - shape.r - half,
                            shape.cx + shape.r + half,
                            shape.cy + shape.r + half,
                        )
                    is AgentIconShape.Pulse -> IconBounds(shape.x, shape.y, shape.x + shape.side, shape.y + shape.side)
                    is AgentIconShape.Line ->
                        IconBounds(
                            shape.points.minOf { it.x } - half,
                            shape.points.minOf { it.y } - half,
                            shape.points.maxOf { it.x } + half,
                            shape.points.maxOf { it.y } + half,
                        )
                }
            }
        return IconBounds(boxes.minOf { it.left }, boxes.minOf { it.top }, boxes.maxOf { it.right }, boxes.maxOf { it.bottom })
    }
}

private const val GRID = 20f
private const val STROKE = 1.6f

private fun line(vararg points: Float): AgentIconShape.Line =
    AgentIconShape.Line(
        points.toList().chunked(2).map {
            IconPoint(it[0], it[1])
        },
    )

/**
 * O desenho dos onze status, o `Inside` do web. Um status que não é de agente (ou o desconhecido) é o quadrado liso e apagado,
 * sem nada dentro: o app mostra que há um agente, sem inventar um status.
 */
fun agentStatusIcon(status: TaskStatus?): AgentStatusIconSpec {
    fun icon(
        tone: AgentIconTone,
        frame: AgentIconFrame = AgentIconFrame.Plain,
        vararg inside: AgentIconShape,
    ) = AgentStatusIconSpec(tone, frame, inside.toList())
    return when (status) {
        TaskStatus.Preparing -> icon(AgentIconTone.Muted, AgentIconFrame.Dashed)
        TaskStatus.Queued -> icon(AgentIconTone.Muted, AgentIconFrame.Plain, AgentIconShape.Dot(10f, 10f, 1.75f))
        TaskStatus.Starting -> icon(AgentIconTone.Accent, AgentIconFrame.Dim, AgentIconShape.Ring(10f, 10f, 4.25f))
        TaskStatus.Running -> icon(AgentIconTone.Accent, AgentIconFrame.Plain, AgentIconShape.Pulse(6f, 6f, 8f, 1.5f))
        TaskStatus.Waiting ->
            icon(
                AgentIconTone.Warning,
                AgentIconFrame.Plain,
                AgentIconShape.Dot(6f, 10f, 1.2f),
                AgentIconShape.Dot(10f, 10f, 1.2f),
                AgentIconShape.Dot(14f, 10f, 1.2f),
            )
        TaskStatus.AwaitingTranscription -> icon(AgentIconTone.Muted, AgentIconFrame.Plain, AgentIconShape.Hollow(10f, 10f, 3f))
        TaskStatus.Completed ->
            icon(AgentIconTone.Success, AgentIconFrame.Solid, line(6.2f, 10.2f, 8.8f, 12.8f, 13.8f, 7.4f).copy(onSolid = true))
        TaskStatus.Interrupted -> icon(AgentIconTone.Warning, AgentIconFrame.Plain, line(6.5f, 10f, 13.5f, 10f))
        TaskStatus.Failed ->
            icon(AgentIconTone.Destructive, AgentIconFrame.Plain, line(10f, 5.8f, 10f, 10.8f), AgentIconShape.Dot(10f, 14.1f, 1.05f))
        TaskStatus.Cancelled ->
            icon(
                AgentIconTone.Muted,
                AgentIconFrame.Plain,
                line(6.8f, 6.8f, 13.2f, 13.2f),
                line(13.2f, 6.8f, 6.8f, 13.2f),
            )
        TaskStatus.RolledBack ->
            icon(AgentIconTone.Muted, AgentIconFrame.Plain, line(9.4f, 6.6f, 6f, 10f, 9.4f, 13.4f), line(14f, 6.6f, 10.6f, 10f, 14f, 13.4f))
        else -> icon(AgentIconTone.Muted)
    }
}

/** A cor de um tom: os mesmos tokens que o CSS do web usa. */
@Composable
fun agentToneColor(tone: AgentIconTone): Color {
    val tokens = braidTokens()
    return when (tone) {
        AgentIconTone.Muted -> MaterialTheme.colorScheme.onSurfaceVariant
        AgentIconTone.Accent -> tokens.brandAccent
        AgentIconTone.Warning -> tokens.warning
        AgentIconTone.Success -> tokens.success
        AgentIconTone.Destructive -> MaterialTheme.colorScheme.error
    }
}

private val SQUARE_PATH = svgRect(1f, 1f, 18f, 18f, 5f)
private val DASHED_FRAME = floatArrayOf(3.1f, 2.185f)

// O `stroke-dashoffset: -2.45` do web, no sentido do `phase` do Android: o período do tracejado menos 2,45.
private const val DASHED_FRAME_PHASE = 2.835f
private val SPIN_ARC = floatArrayOf(19f, 7.7f)
private const val SPIN_MILLIS = 900
private const val PULSE_HALF_MILLIS = 700
private const val PULSE_LOW = 0.35f
private const val DIM_ALPHA = 0.4f

@Composable
private fun rememberSpinAngle(motion: AgentIconMotion): State<Float> {
    if (motion != AgentIconMotion.Spin) return remember { mutableFloatStateOf(0f) }
    return rememberInfiniteTransition(label = "agent-icon-spin")
        .animateFloat(0f, 360f, infiniteRepeatable(tween(SPIN_MILLIS, easing = LinearEasing)), label = "angle")
}

@Composable
private fun rememberPulseAlpha(motion: AgentIconMotion): State<Float> {
    if (motion != AgentIconMotion.Pulse) return remember { mutableFloatStateOf(1f) }
    return rememberInfiniteTransition(label = "agent-icon-pulse")
        .animateFloat(1f, PULSE_LOW, infiniteRepeatable(tween(PULSE_HALF_MILLIS, easing = EaseInOut), RepeatMode.Reverse), label = "alpha")
}

/**
 * O ícone quadrado do status de agente, com o nome para o leitor de tela no padrão "Agente, na fila". O giro e o pulso
 * param quando o sistema desliga as animações.
 */
@Composable
fun AgentStatusIcon(
    status: TaskStatus?,
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
) {
    val spec = remember(status) { agentStatusIcon(status) }
    val color = agentToneColor(spec.tone)
    val background = MaterialTheme.colorScheme.background
    val motion = spec.motion(rememberReducedMotion())
    val angle = rememberSpinAngle(motion)
    val pulse = rememberPulseAlpha(motion)
    val square = remember { PathParser().parsePathString(SQUARE_PATH).toPath() }
    val name = taskStatusName(TaskActor.Agent, status)
    Canvas(
        modifier.size(size).clearAndSetSemantics {
            contentDescription = name
            role = Role.Image
        },
    ) {
        val factor = this.size.width / GRID
        scale(factor, factor, pivot = Offset.Zero) {
            drawFrame(spec.frame, square, color)
            spec.inside.forEach { drawInside(it, color, background, angle.value, pulse.value) }
        }
    }
}

private fun DrawScope.drawFrame(
    frame: AgentIconFrame,
    square: Path,
    color: Color,
) {
    val round = Stroke(width = STROKE, cap = StrokeCap.Round, join = StrokeJoin.Round)
    when (frame) {
        AgentIconFrame.Plain -> drawPath(square, color, style = round)
        AgentIconFrame.Dim -> drawPath(square, color.copy(alpha = DIM_ALPHA), style = round)
        AgentIconFrame.Solid -> {
            drawPath(square, color, style = Fill)
            drawPath(square, color, style = round)
        }
        AgentIconFrame.Dashed ->
            drawPath(
                square,
                color,
                style =
                    Stroke(
                        width = STROKE,
                        cap = StrokeCap.Butt,
                        join = StrokeJoin.Round,
                        pathEffect = PathEffect.dashPathEffect(DASHED_FRAME, DASHED_FRAME_PHASE),
                    ),
            )
    }
}

private fun DrawScope.drawInside(
    shape: AgentIconShape,
    color: Color,
    background: Color,
    spinDegrees: Float,
    pulseAlpha: Float,
) {
    when (shape) {
        is AgentIconShape.Dot -> drawCircle(color, shape.r, Offset(shape.cx, shape.cy), style = Fill)
        is AgentIconShape.Hollow ->
            drawCircle(
                color,
                shape.r,
                Offset(shape.cx, shape.cy),
                style = Stroke(width = STROKE, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )
        is AgentIconShape.Pulse ->
            drawRoundRect(
                color.copy(alpha = pulseAlpha),
                topLeft = Offset(shape.x, shape.y),
                size = Size(shape.side, shape.side),
                cornerRadius = CornerRadius(shape.radius),
                style = Fill,
            )
        is AgentIconShape.Ring ->
            rotate(spinDegrees, pivot = Offset(shape.cx, shape.cy)) {
                drawCircle(
                    color,
                    shape.r,
                    Offset(shape.cx, shape.cy),
                    style =
                        Stroke(
                            width = STROKE,
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round,
                            pathEffect = PathEffect.dashPathEffect(SPIN_ARC),
                        ),
                )
            }
        is AgentIconShape.Line -> {
            val path =
                Path().apply {
                    shape.points.forEachIndexed { index, point -> if (index == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y) }
                }
            drawPath(
                path,
                if (shape.onSolid) background else color,
                style = Stroke(width = STROKE, cap = StrokeCap.Round, join = StrokeJoin.Round),
            )
        }
    }
}
