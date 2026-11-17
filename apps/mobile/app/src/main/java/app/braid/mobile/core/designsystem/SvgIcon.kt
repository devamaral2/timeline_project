package app.braid.mobile.core.designsystem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Um traço de um ícone desenhado na grade de 24 do web. Os ícones do app são os
 * mesmos SVG do web, com o `d` copiado: [fill] pinta o interior em vez de
 * contornar; [color] troca a cor do ícone neste traço; [outline] desenha o
 * contorno por cima do preenchimento (o ponto de "em curso", recortado no fundo).
 */
data class SvgPart(
    val pathData: String,
    val fill: Boolean = false,
    val dash: List<Float>? = null,
    val color: Color? = null,
    val outline: Color? = null,
    val outlineWidth: Float = 0f,
)

/** `<circle>` como caminho. */
fun svgCircle(
    cx: Float,
    cy: Float,
    r: Float,
): String = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0Z"

/** `<rect>` com cantos arredondados como caminho. */
fun svgRect(
    x: Float,
    y: Float,
    width: Float,
    height: Float,
    radius: Float,
): String =
    "M${x + radius} ${y}H${x + width - radius}a$radius $radius 0 0 1 $radius $radius" +
        "V${y + height - radius}a$radius $radius 0 0 1 ${-radius} $radius" +
        "H${x + radius}a$radius $radius 0 0 1 ${-radius} ${-radius}" +
        "V${y + radius}a$radius $radius 0 0 1 $radius ${-radius}Z"

/** `<line>` como caminho. */
fun svgLine(
    x1: Float,
    y1: Float,
    x2: Float,
    y2: Float,
): String = "M$x1 ${y1}L$x2 $y2"

private const val DEFAULT_GRID = 24f

/**
 * Desenha [parts] numa caixa quadrada de [size], escalando a grade de [grid] (24 na maioria dos ícones).
 * O traço é redondo nas pontas e nas quinas, como o `stroke-linecap: round` do web.
 */
@Composable
fun SvgIcon(
    parts: List<SvgPart>,
    modifier: Modifier = Modifier,
    size: Dp = 24.dp,
    color: Color = LocalContentColor.current,
    strokeWidth: Float = 2f,
    grid: Float = DEFAULT_GRID,
) {
    val paths = remember(parts) { parts.map { PathParser().parsePathString(it.pathData).toPath() } }
    Canvas(modifier.size(size)) {
        val factor = this.size.width / grid
        scale(factor, factor, pivot = Offset.Zero) {
            parts.forEachIndexed { index, part ->
                val path = paths[index]
                val tint = part.color ?: color
                if (part.fill) {
                    drawPath(path, tint, style = Fill)
                    part.outline?.let {
                        drawPath(path, it, style = Stroke(width = part.outlineWidth, cap = StrokeCap.Round, join = StrokeJoin.Round))
                    }
                } else {
                    val effect = part.dash?.let { PathEffect.dashPathEffect(it.toFloatArray()) }
                    drawPath(
                        path,
                        tint,
                        style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round, pathEffect = effect),
                    )
                }
            }
        }
    }
}
