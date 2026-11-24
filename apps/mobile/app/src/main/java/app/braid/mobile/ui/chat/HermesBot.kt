package app.braid.mobile.ui.chat

import android.provider.Settings
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Transition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.core.designsystem.svgRect
import kotlinx.coroutines.delay

/*
 * O robô do Hermes e os seus cinco estados, com as animações do web (`hermes-bot.module.css`): parado ele pisca; ao ouvir,
 * pensar, concluir ou falhar o corpo se desfaz e as peças viram a onda, os cinco pontos, o ✓ (que se desenha, com um pulo)
 * ou a exclamação (que balança). Cada peça vai de uma pose a outra com os tempos do app: 240 ms na curva de saída para a
 * forma e 120 ms lineares para a opacidade. Com as animações desligadas no sistema, só a pose muda.
 */

private const val GRID = 32f
private const val STROKE = 2.3f
private const val CHECK_STROKE = 3.2f

/** `--ease-out` do web. */
private val EaseOut: Easing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

/** `ease-in-out` do CSS, a curva dos laços (piscar, onda, pontos). */
private val EaseInOut: Easing = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

/** A queda do ponto da exclamação, que passa do lugar e volta. */
private val Bounce: Easing = CubicBezierEasing(0.3f, 1.6f, 0.5f, 1f)

private const val SLOW_MS = 240
private const val FADE_MS = 120
private const val REDUCED_MS = 150

private const val BLINK_DELAY_MS = 1400L
private const val BLINK_PERIOD_MS = 4800L
private const val BLINK_START = 0.93f
private const val WAVE_PERIOD_MS = 900L
private const val DOT_PERIOD_MS = 1200L
private const val DOT_REST = 0.35f
private const val POP_DELAY_MS = 170L
private const val POP_MS = 460L
private const val SHAKE_DELAY_MS = 80L
private const val SHAKE_MS = 380L

/** As peças do desenho, na ordem do SVG do web. */
private enum class Piece(
    val pathData: String,
    val fill: Boolean,
) {
    Antenna("M16 9.5V6", fill = false),
    AntennaTip(svgCircle(16f, 4.6f, 2f), fill = true),
    Shell(svgRect(5.5f, 9.5f, 21f, 16f, 5.5f), fill = false),
    EarL("M2.6 15.5v4", fill = false),
    EarR("M29.4 15.5v4", fill = false),
    EyeL(svgCircle(12f, 17.5f, 2.1f), fill = true),
    EyeR(svgCircle(20f, 17.5f, 2.1f), fill = true),
    W1(svgRect(3.4f, 12f, 3.2f, 8f, 1.6f), fill = true),
    W2(svgRect(8.9f, 8f, 3.2f, 16f, 1.6f), fill = true),
    W3(svgRect(14.4f, 4f, 3.2f, 24f, 1.6f), fill = true),
    W4(svgRect(19.9f, 9f, 3.2f, 14f, 1.6f), fill = true),
    W5(svgRect(25.4f, 12f, 3.2f, 8f, 1.6f), fill = true),
    D1(svgCircle(5f, 16f, 2.1f), fill = true),
    D2(svgCircle(10.5f, 16f, 2.1f), fill = true),
    D3(svgCircle(16f, 16f, 2.1f), fill = true),
    D4(svgCircle(21.5f, 16f, 2.1f), fill = true),
    D5(svgCircle(27f, 16f, 2.1f), fill = true),
    Check("m8 16.5 5.5 5.5L24 10.5", fill = false),
    Ex(svgRect(14.4f, 5f, 3.2f, 15f, 1.6f), fill = true),
    Point(svgCircle(16f, 25.4f, 2f), fill = true),
}

/** Onde a peça está num estado: opacidade, deslocamento e escala em torno do próprio centro (o `fill-box` do web). */
private data class Pose(
    val alpha: Float = 1f,
    val tx: Float = 0f,
    val ty: Float = 0f,
    val sx: Float = 1f,
    val sy: Float = 1f,
)

private val Hidden = Pose(alpha = 0f)

/** As barras da onda e os pontos: de onde vêm (escondidos), a escala ao pensar e para onde se recolhem no fim. */
private class Strand(
    val restX: Float,
    val restY: Float,
    val restScale: Float,
    val thinkScale: Float,
    val endX: Float,
    val waveDelay: Long,
    val dotDelay: Long,
)

private val Strands =
    listOf(
        Strand(-2.4f, 1.5f, 0.75f, 0.52f, 11f, 260, 280),
        Strand(1.5f, 1.5f, 0.26f, 0.26f, 5.5f, 370, 430),
        Strand(0f, -10f, 0.29f, 0.175f, 0f, 480, 580),
        Strand(-1.5f, 1.5f, 0.3f, 0.3f, -5.5f, 590, 730),
        Strand(2.4f, 1.5f, 0.75f, 0.52f, -11f, 700, 880),
    )

/** O ponto vem de um pouco mais alto que a barra do meio. */
private const val MIDDLE_DOT_Y = -11.4f

private fun pose(
    piece: Piece,
    state: BotState,
): Pose {
    val idle = state == BotState.Idle
    return when (piece) {
        Piece.Shell -> if (idle) Pose() else Pose(alpha = 0f, sx = 0.82f, sy = 0.82f)
        Piece.Antenna, Piece.AntennaTip -> if (idle) Pose() else Pose(alpha = 0f, ty = 6f)
        Piece.EarL -> if (idle) Pose() else Pose(alpha = 0f, tx = 2.4f, ty = -1.5f)
        Piece.EarR -> if (idle) Pose() else Pose(alpha = 0f, tx = -2.4f, ty = -1.5f)
        Piece.EyeL -> if (idle) Pose() else Pose(alpha = 0f, tx = -1.5f, ty = -1.5f)
        Piece.EyeR -> if (idle) Pose() else Pose(alpha = 0f, tx = 1.5f, ty = -1.5f)
        Piece.W1, Piece.W2, Piece.W3, Piece.W4, Piece.W5 -> {
            val strand = Strands[piece.ordinal - Piece.W1.ordinal]
            when (state) {
                BotState.Listening -> Pose()
                BotState.Thinking -> Pose(alpha = 0f, sy = strand.thinkScale)
                BotState.Done, BotState.Error -> Pose(alpha = 0f, tx = strand.endX, sy = 0.1f)
                BotState.Idle -> Pose(alpha = 0f, tx = strand.restX, ty = strand.restY, sy = strand.restScale)
            }
        }
        Piece.D1, Piece.D2, Piece.D3, Piece.D4, Piece.D5 -> {
            val strand = Strands[piece.ordinal - Piece.D1.ordinal]
            when (state) {
                BotState.Listening -> Hidden
                BotState.Thinking -> Pose(alpha = DOT_REST)
                BotState.Done, BotState.Error -> Pose(alpha = 0f, tx = strand.endX, sx = 0.3f, sy = 0.3f)
                BotState.Idle -> Pose(alpha = 0f, tx = strand.restX, ty = if (piece == Piece.D3) MIDDLE_DOT_Y else strand.restY)
            }
        }
        Piece.Check -> if (state == BotState.Done) Pose() else Hidden
        Piece.Ex -> if (state == BotState.Error) Pose() else Pose(alpha = 0f, ty = 3.5f, sy = 0.28f)
        Piece.Point -> if (state == BotState.Error) Pose() else Pose(alpha = 0f, ty = -9.4f)
    }
}

/** A forma da peça indo para [target]: a exclamação espera um pouco e o ponto cai com um quique. */
private fun transformSpec(
    piece: Piece,
    target: BotState,
    reduced: Boolean,
): FiniteAnimationSpec<Float> =
    when {
        reduced -> tween(REDUCED_MS)
        piece == Piece.Ex && target == BotState.Error -> tween(SLOW_MS, delayMillis = 60, easing = EaseOut)
        piece == Piece.Point && target == BotState.Error -> tween(380, delayMillis = 150, easing = Bounce)
        else -> tween(SLOW_MS, easing = EaseOut)
    }

private fun alphaSpec(
    piece: Piece,
    target: BotState,
    reduced: Boolean,
): FiniteAnimationSpec<Float> =
    when {
        reduced -> tween(REDUCED_MS)
        piece == Piece.Check && target == BotState.Done -> tween(60, delayMillis = 110, easing = LinearEasing)
        piece == Piece.Check -> tween(REDUCED_MS, easing = LinearEasing)
        piece == Piece.Ex && target == BotState.Error -> tween(FADE_MS, delayMillis = 60, easing = LinearEasing)
        piece == Piece.Point && target == BotState.Error -> tween(FADE_MS, delayMillis = 150, easing = LinearEasing)
        else -> tween(FADE_MS, easing = LinearEasing)
    }

private class AnimatedPose(
    val alpha: State<Float>,
    val tx: State<Float>,
    val ty: State<Float>,
    val sx: State<Float>,
    val sy: State<Float>,
)

@Composable
private fun Transition<BotState>.animatedPose(
    piece: Piece,
    reduced: Boolean,
): AnimatedPose {
    val shape: @Composable Transition.Segment<BotState>.() -> FiniteAnimationSpec<Float> = { transformSpec(piece, targetState, reduced) }
    return AnimatedPose(
        alpha = animateFloat({ alphaSpec(piece, targetState, reduced) }, label = "alpha") { pose(piece, it).alpha },
        tx = animateFloat(shape, label = "tx") { pose(piece, it).tx },
        ty = animateFloat(shape, label = "ty") { pose(piece, it).ty },
        sx = animateFloat(shape, label = "sx") { pose(piece, it).sx },
        sy = animateFloat(shape, label = "sy") { pose(piece, it).sy },
    )
}

/** Valor de uma animação em quadros-chave ([at] e [value] em pares), com [easing] em cada trecho. */
private fun keyframes(
    progress: Float,
    stops: List<Pair<Float, Float>>,
    easing: Easing,
): Float {
    val next = stops.indexOfFirst { it.first >= progress }
    if (next <= 0) return stops.first().second
    val (fromAt, from) = stops[next - 1]
    val (toAt, to) = stops[next]
    val local = if (toAt == fromAt) 1f else (progress - fromAt) / (toAt - fromAt)
    return from + (to - from) * easing.transform(local)
}

private val BlinkStops = listOf(0f to 1f, BLINK_START to 1f, 0.965f to 0.12f, 1f to 1f)
private val WaveStops = listOf(0f to 1f, 0.5f to 0.5f, 1f to 1f)
private val DotStops = listOf(0f to DOT_REST, 0.3f to 1f, 0.6f to DOT_REST, 1f to DOT_REST)
private val PopStops = listOf(0f to 1f, 0.4f to 1.14f, 1f to 1f)
private val ShakeStops = listOf(0f to 0f, 0.18f to -2f, 0.38f to 2f, 0.58f to -1.4f, 0.78f to 1f, 1f to 0f)

private fun loopProgress(
    elapsed: Long,
    delay: Long,
    period: Long,
): Float? = if (elapsed < delay) null else ((elapsed - delay) % period).toFloat() / period

private fun onceProgress(
    elapsed: Long,
    delay: Long,
    duration: Long,
): Float? = if (elapsed < delay || elapsed > delay + duration) null else (elapsed - delay).toFloat() / duration

/** Se o sistema desligou as animações (escala de duração 0): o robô só troca de pose e nada voa. */
@Composable
fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/**
 * Os laços e os efeitos de um tiro contam o tempo desde a troca de estado. Parado, o robô só pede quadros durante a
 * piscada; o ✓ e a exclamação param depois do pulo e do balanço.
 */
@Composable
private fun rememberStateClock(
    state: BotState,
    reduced: Boolean,
): State<Long> {
    val elapsed = remember { mutableLongStateOf(0L) }
    LaunchedEffect(state, reduced) {
        elapsed.longValue = 0L
        if (reduced) return@LaunchedEffect
        val start = withFrameMillis { it }
        while (true) {
            val now = withFrameMillis { it } - start
            elapsed.longValue = now
            when (state) {
                BotState.Idle -> {
                    val cycle = if (now < BLINK_DELAY_MS) 0L else (now - BLINK_DELAY_MS) % BLINK_PERIOD_MS
                    val blinkAt = (BLINK_PERIOD_MS * BLINK_START).toLong()
                    val wait = if (now < BLINK_DELAY_MS) BLINK_DELAY_MS + blinkAt - now else blinkAt - cycle
                    if (wait > 0) delay(wait)
                }
                BotState.Done -> if (now > POP_DELAY_MS + POP_MS) break
                BotState.Error -> if (now > SHAKE_DELAY_MS + SHAKE_MS) break
                BotState.Listening, BotState.Thinking -> Unit
            }
        }
    }
    return elapsed
}

private class PieceShape(
    val piece: Piece,
    val path: Path,
    val bounds: Rect,
    val length: Float,
)

private val Shapes: List<PieceShape> by lazy {
    Piece.entries.map { piece ->
        val path = PathParser().parsePathString(piece.pathData).toPath()
        PieceShape(piece, path, path.getBounds(), PathMeasure().apply { setPath(path, false) }.length)
    }
}

/**
 * O desenho do robô do Hermes num dos cinco estados, animado como no web: parado, ouvindo (a onda), pensando (cinco
 * pontos), concluiu (o ✓) e erro (a exclamação). É só um sinal: quem fala do estado é o texto ao lado.
 */
@Composable
fun HermesBotIcon(
    state: BotState,
    size: Dp,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val reduced = rememberReducedMotion()
    val transition = updateTransition(state, label = "hermes")
    val poses = Shapes.map { shape -> key(shape.piece) { transition.animatedPose(shape.piece, reduced) } }
    val draw =
        transition.animateFloat(
            {
                when {
                    reduced -> tween(REDUCED_MS)
                    targetState == BotState.Done -> tween(300, delayMillis = 110, easing = EaseOut)
                    else -> tween(REDUCED_MS, easing = LinearEasing)
                }
            },
            label = "check",
        ) { if (it == BotState.Done) 1f else 0f }
    val clock = rememberStateClock(state, reduced)
    Canvas(modifier.size(size)) {
        val elapsed = clock.value
        val factor = this.size.minDimension / GRID
        withTransform({
            scale(factor, factor, pivot = Offset.Zero)
            groupTransform(state, elapsed, reduced)
        }) {
            Shapes.forEachIndexed { index, shape ->
                drawPiece(shape, poses[index], state, elapsed, reduced, color, draw.value)
            }
        }
    }
}

/** O pulo do ✓ e o balanço da exclamação mexem no desenho inteiro, em torno do centro da grade. */
private fun androidx.compose.ui.graphics.drawscope.DrawTransform.groupTransform(
    state: BotState,
    elapsed: Long,
    reduced: Boolean,
) {
    if (reduced) return
    val center = Offset(GRID / 2, GRID / 2)
    if (state == BotState.Done) {
        onceProgress(elapsed, POP_DELAY_MS, POP_MS)?.let {
            val pop = keyframes(it, PopStops, EaseOut)
            scale(pop, pop, pivot = center)
        }
    }
    if (state == BotState.Error) {
        onceProgress(elapsed, SHAKE_DELAY_MS, SHAKE_MS)?.let { translate(left = keyframes(it, ShakeStops, LinearEasing)) }
    }
}

private fun DrawScope.drawPiece(
    shape: PieceShape,
    pose: AnimatedPose,
    state: BotState,
    elapsed: Long,
    reduced: Boolean,
    color: Color,
    checkDrawn: Float,
) {
    val piece = shape.piece
    var alpha = pose.alpha.value
    var sy = pose.sy.value
    if (!reduced) {
        when (piece) {
            Piece.EyeL, Piece.EyeR ->
                if (state ==
                    BotState.Idle
                ) {
                    loopProgress(elapsed, BLINK_DELAY_MS, BLINK_PERIOD_MS)?.let { sy *= keyframes(it, BlinkStops, EaseInOut) }
                }
            Piece.W1, Piece.W2, Piece.W3, Piece.W4, Piece.W5 -> {
                val strand = Strands[piece.ordinal - Piece.W1.ordinal]
                if (state == BotState.Listening) {
                    loopProgress(elapsed, strand.waveDelay, WAVE_PERIOD_MS)?.let { sy = keyframes(it, WaveStops, EaseInOut) }
                }
            }
            Piece.D1, Piece.D2, Piece.D3, Piece.D4, Piece.D5 -> {
                val strand = Strands[piece.ordinal - Piece.D1.ordinal]
                if (state == BotState.Thinking) {
                    loopProgress(elapsed, strand.dotDelay, DOT_PERIOD_MS)?.let { alpha = keyframes(it, DotStops, EaseInOut) }
                }
            }
            else -> Unit
        }
    } else if (state == BotState.Thinking && piece.name.startsWith("D")) {
        // Com movimento reduzido os pontos ficam acesos, sem o laço.
        alpha = 1f
    }
    if (alpha <= 0.001f) return
    val center = shape.bounds.center
    withTransform({
        translate(pose.tx.value, pose.ty.value)
        scale(pose.sx.value, sy, pivot = center)
    }) {
        val tint = color.copy(alpha = color.alpha * alpha.coerceIn(0f, 1f))
        when {
            piece == Piece.Check -> {
                val visible = Path()
                PathMeasure().apply { setPath(shape.path, false) }.getSegment(0f, shape.length * checkDrawn, visible, true)
                drawPath(visible, tint, style = Stroke(width = CHECK_STROKE, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
            piece.fill -> drawPath(shape.path, tint, style = Fill)
            else -> drawPath(shape.path, tint, style = Stroke(width = STROKE, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

/**
 * O robô no disco verde-água (`.bot` do web), no tamanho de quem usa: 28 dp na linha de status, 52 dp na barra inferior e
 * no voo entre elas. O desenho ocupa 58% do disco; ouvindo, um halo sai dele; no erro o disco fica vermelho.
 *
 * [plain] tira o disco (`data-plain` do web, canvas "Input do detalhe da entidade"): o desenho fica solto, maior (86% da
 * caixa), na cor do texto de apoio em todos os estados, sem halo nem vermelho. Os movimentos dos estados são os mesmos.
 */
@Composable
fun HermesBot(
    state: BotState,
    size: Dp,
    modifier: Modifier = Modifier,
    plain: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    val brand = braidTokens().brand
    val reduced = rememberReducedMotion()
    val disc by animateColorAsState(
        if (state == BotState.Error) scheme.error else brand,
        tween(REDUCED_MS, easing = LinearEasing),
        label = "disc",
    )
    val glyph by animateColorAsState(
        when {
            plain -> scheme.onSurfaceVariant
            state == BotState.Error -> scheme.onError
            else -> scheme.background
        },
        tween(REDUCED_MS, easing = LinearEasing),
        label = "glyph",
    )
    val halo by animateFloatAsState(
        if (state == BotState.Listening && !plain) 1f else 0f,
        tween(if (reduced) REDUCED_MS else SLOW_MS, easing = EaseOut),
        label = "halo",
    )
    Box(
        modifier
            .size(size)
            .drawBehind {
                if (plain) return@drawBehind
                if (halo > 0f) {
                    drawCircle(brand.copy(alpha = HALO_ALPHA * halo), radius = this.size.minDimension / 2 * (1 + HALO_SPREAD * 2 * halo))
                }
                drawCircle(disc)
            }.clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        HermesBotIcon(state, size = size * if (plain) PLAIN_GLYPH_RATIO else GLYPH_RATIO, color = glyph)
    }
}

private const val GLYPH_RATIO = 0.58f
private const val PLAIN_GLYPH_RATIO = 0.86f
private const val HALO_ALPHA = 0.3f

/** O halo do web: `0 0 0 .17em`, a 17% do tamanho do disco além da borda. */
private const val HALO_SPREAD = 0.17f
