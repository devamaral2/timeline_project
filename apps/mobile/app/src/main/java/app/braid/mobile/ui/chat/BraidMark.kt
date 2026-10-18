package app.braid.mobile.ui.chat

import android.animation.ValueAnimator
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.braidStrandDestaque
import app.braid.mobile.core.designsystem.braidStrandNevoa
import app.braid.mobile.core.designsystem.braidStrandTinta

private const val STRAND_TOP = 11.24f
private const val BRAID_TOP = 7f
private const val BRAID_BOTTOM = 93.3f
private const val VIEWBOX_LEFT = 29f
private const val VIEWBOX_WIDTH = 42f
private const val STRAND_WIDTH = 5.81f
private const val CUT_WIDTH = 11.05f
private val MARK_WIDTH = 36.dp

/** A linha do tempo do web (`.braidTails`, `.braidKnot`, `.braidDot`), em milissegundos. */
private const val TOTAL_MS = 2250f
private val TailsEasing = CubicBezierEasing(0.45f, 0f, 0.55f, 1f)
private val KnotEasing = CubicBezierEasing(0.25f, 0.55f, 0.4f, 1f)
private val DotEasing = CubicBezierEasing(0.34f, 1.56f, 0.64f, 1f)

/** Comprimento dos fios soltos no painel e na tela inteira, como no web. */
const val BRAID_TAIL_PANEL = 73.61f
const val BRAID_TAIL_FULL = 194.94f

/**
 * A marca do chat com IA (`BraidMark` do web): três fios descem, se trançam e o
 * ponto aparece no pé. Com as animações do sistema desligadas, aparece pronta.
 * Para repetir, quem chama troca a `key` em volta dela.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun BraidMark(
    tail: Float,
    modifier: Modifier = Modifier,
) {
    val tones =
        mapOf(
            BraidTone.Nevoa to braidStrandNevoa(),
            BraidTone.Destaque to braidStrandDestaque(),
            BraidTone.Tinta to braidStrandTinta(),
        )
    val strandX = mapOf(BraidTone.Nevoa to 66.96f, BraidTone.Destaque to 33.04f, BraidTone.Tinta to 50f)
    val strands =
        remember {
            BRAID_STRANDS.map { strand ->
                Triple(
                    strand.tone,
                    PathParser().parsePathString(strand.path).toPath(),
                    strand.cuts.map { PathParser().parsePathString(it.path).toPath() to it.round },
                )
            }
        }
    val animate = remember { ValueAnimator.areAnimatorsEnabled() }
    val clock = remember { Animatable(if (animate) 0f else TOTAL_MS) }
    LaunchedEffect(clock) {
        if (animate) clock.animateTo(TOTAL_MS, tween(TOTAL_MS.toInt(), easing = LinearEasing))
    }

    val top = STRAND_TOP - tail + 4f
    val viewHeight = BRAID_BOTTOM - top
    Canvas(modifier = modifier.size(MARK_WIDTH, MARK_WIDTH * (viewHeight / VIEWBOX_WIDTH))) {
        val unit = size.width / VIEWBOX_WIDTH
        val t = clock.value
        val tails = TailsEasing.transform(((t - 300f) / 1500f).coerceIn(0f, 1f))
        val knot = KnotEasing.transform(((t - 1050f) / 750f).coerceIn(0f, 1f))
        val dot = DotEasing.transform(((t - 1800f) / 450f).coerceIn(0f, 1f))

        withTransform({
            translate(-VIEWBOX_LEFT * unit, -top * unit)
            scale(unit, unit, pivot = Offset.Zero)
        }) {
            // Cada fio e um traco do tamanho dele que entra por cima e some na trança.
            val offset = (tail + 1f) - tails * 2f * (tail + 1f)
            val from = (-offset).coerceIn(0f, tail)
            val to = (-offset + tail).coerceIn(0f, tail)
            if (to > from) {
                strandX.forEach { (tone, x) ->
                    drawLine(
                        color = tones.getValue(tone),
                        start = Offset(x, STRAND_TOP - tail + from),
                        end = Offset(x, STRAND_TOP - tail + to),
                        strokeWidth = STRAND_WIDTH,
                        cap = StrokeCap.Round,
                    )
                }
            }

            // A trança se revela de cima para baixo, como a máscara do web.
            val revealed = BRAID_TOP + (BRAID_BOTTOM - BRAID_TOP) * (1f + (knot - 1f) * 81f / 74f)
            if (knot > 0f && revealed > BRAID_TOP) {
                clipRect(left = VIEWBOX_LEFT, top = BRAID_TOP, right = VIEWBOX_LEFT + VIEWBOX_WIDTH, bottom = revealed) {
                    strands.forEach { (tone, path, cuts) ->
                        drawContext.canvas.saveLayer(Rect(-150f, -150f, 250f, 250f), Paint())
                        drawPath(
                            path = path,
                            color = tones.getValue(tone),
                            style = Stroke(width = STRAND_WIDTH, cap = StrokeCap.Round, join = StrokeJoin.Round),
                        )
                        cuts.forEach { (cut, round) ->
                            drawPath(
                                path = cut,
                                color = Color.Black,
                                style =
                                    Stroke(
                                        width = CUT_WIDTH,
                                        cap = if (round) StrokeCap.Round else StrokeCap.Butt,
                                        join = StrokeJoin.Round,
                                    ),
                                blendMode = BlendMode.DstOut,
                            )
                        }
                        drawContext.canvas.restore()
                    }
                }
            }
        }

        if (dot > 0f) {
            val radius = 5.25.dp.toPx() * dot
            drawCircle(
                color = tones.getValue(BraidTone.Destaque),
                radius = radius,
                center = Offset(18.05.dp.toPx(), size.height - 5.55.dp.toPx()),
            )
        }
    }
}
