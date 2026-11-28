package app.braid.mobile.ui.chat

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import app.braid.mobile.core.designsystem.Motion
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/*
 * O voo do botão do Hermes (`hermes-flight.ts` e `mobile-navigation.tsx` no web): ao abrir o chat, ou ao entrar num
 * detalhe com o campo do Hermes, o disco verde-água corre para o lado, encolhe, sai da barra inferior e pousa como o ícone
 * de status do campo; ao fechar o chat, ou ao sair do detalhe, volta pelo mesmo caminho. Enquanto voa, o ícone de verdade
 * fica escondido e o resto do campo sobe para o lugar. Com as animações desligadas no sistema, nada voa.
 */

const val FLIGHT_OUT_MS = Motion.FLIGHT_OUT_MS
const val FLIGHT_BACK_MS = Motion.FLIGHT_BACK_MS

/** O caminho em nove amostras igualmente espaçadas no tempo: quanto do desvio horizontal, do vertical e do encolhimento. */
private val PATH =
    listOf(
        floatArrayOf(0f, 0f, 0f),
        floatArrayOf(0.379f, 0f, 0.043f),
        floatArrayOf(0.648f, 0.02f, 0.156f),
        floatArrayOf(0.826f, 0.143f, 0.316f),
        floatArrayOf(0.93f, 0.338f, 0.5f),
        floatArrayOf(0.981f, 0.564f, 0.684f),
        floatArrayOf(0.998f, 0.778f, 0.842f),
        floatArrayOf(1f, 0.937f, 0.957f),
        floatArrayOf(1f, 1f, 1f),
    )

/** O ponto do caminho em [progress] (0 a 1), interpolando as amostras em linha reta, como a animação linear do web. */
internal fun flightSample(progress: Float): FloatArray {
    val scaled = progress.coerceIn(0f, 1f) * (PATH.size - 1)
    val index = scaled.toInt().coerceAtMost(PATH.size - 2)
    val local = scaled - index
    val from = PATH[index]
    val to = PATH[index + 1]
    return FloatArray(3) { from[it] + (to[it] - from[it]) * local }
}

/** Qual ícone de status recebe o voo: o do chat ou o do campo de um detalhe. */
enum class MarkRole { Chat, Dock }

enum class FlightKind { Out, Back, Dock, Undock }

/** Um voo: [mark] é o ponto de partida fixo da volta (o ícone já pode ter saído da tela). */
data class Flight(
    val kind: FlightKind,
    val serial: Int,
    val mark: Rect? = null,
) {
    val forward: Boolean get() = kind == FlightKind.Out || kind == FlightKind.Dock
    val role: MarkRole get() = if (kind == FlightKind.Out || kind == FlightKind.Back) MarkRole.Chat else MarkRole.Dock
    val durationMillis: Int get() = if (forward) FLIGHT_OUT_MS else FLIGHT_BACK_MS
}

/** Quanto tempo depois de a barra sair o campo de um detalhe ainda chama o botão, e depois de o campo sair a barra o recebe. */
private const val DOCK_GRACE_MS = 600L
private const val UNDOCK_GRACE_MS = 1000L

/**
 * Quem sabe onde estão o botão da barra e os ícones de status, e qual voo está no ar. A barra, o chat e os campos
 * dos detalhes avisam aqui quando aparecem, mudam de lugar ou saem; [HermesFlyer] desenha o voo.
 */
@Stable
class HermesFlight(
    private val now: () -> Long = SystemClock::uptimeMillis,
) {
    var reduced by mutableStateOf(false)

    /** O disco do botão da barra em repouso (durante um voo ele está escondido ou mudando). */
    var button by mutableStateOf<Rect?>(null)
        private set

    var current by mutableStateOf<Flight?>(null)
        private set

    private val marks = mutableStateMapOf<MarkRole, Rect>()

    /** Onde o ícone do chat estava da última vez: abrir de novo já voa para lá, sem esperar o painel ser medido. */
    private var lastChatMark: Rect? = null
    private var serial = 0
    private var barShown = false
    private var barLeftAt = 0L
    private var leftDock: Pair<Rect, Long>? = null

    fun buttonMoved(bounds: Rect) {
        if (current == null) button = bounds
    }

    fun mark(role: MarkRole): Rect? = marks[role] ?: if (role == MarkRole.Chat) lastChatMark else null

    fun markMoved(
        role: MarkRole,
        bounds: Rect,
    ) {
        marks[role] = bounds
        if (role == MarkRole.Chat) lastChatMark = bounds
    }

    /** O ícone de status de um campo apareceu: o do detalhe chama o botão, se a barra acabou de sair. */
    fun markArrived(role: MarkRole) {
        if (role != MarkRole.Dock) return
        leftDock = null
        val late = !barShown
        landBack()
        if (!late || now() - barLeftAt < DOCK_GRACE_MS) start(FlightKind.Dock)
        // De um detalhe para outro não há voo.
        barShown = false
        barLeftAt = 0L
    }

    /** O ícone saiu: o do detalhe guarda de onde a volta parte. */
    fun markLeft(role: MarkRole) {
        val last = marks.remove(role)
        if (role == MarkRole.Dock && last != null) leftDock = last to now()
    }

    /** A barra inferior apareceu ou saiu da tela. Voltando logo depois de um detalhe sair, o ícone volta para ela. */
    fun barChanged(shown: Boolean) {
        if (shown == barShown) return
        barShown = shown
        if (!shown) {
            barLeftAt = now()
            return
        }
        // A barra pode voltar antes de o detalhe sair da tela (a transição de saída o mantém um instante): o ícone ainda
        // à vista é o ponto de partida.
        val left = leftDock ?: marks[MarkRole.Dock]?.let { it to now() }
        leftDock = null
        if (left != null && now() - left.second < UNDOCK_GRACE_MS) {
            landBack()
            start(FlightKind.Undock, left.first)
        }
    }

    fun chatOpened() = start(FlightKind.Out)

    /** O chat fechou: com o ícone à vista, ele volta para a barra antes de o painel sumir. */
    fun chatClosed() {
        val mark = marks[MarkRole.Chat] ?: return
        if (current?.kind != FlightKind.Back) start(FlightKind.Back, mark)
    }

    /** O voo [serial] pousou. */
    fun land(serial: Int) {
        if (current?.serial == serial) current = null
    }

    /** Esconde o ícone de verdade enquanto o voo vai para ele (ou sai dele). */
    fun hidesMark(role: MarkRole): Boolean = current?.role == role

    private fun landBack() {
        if (current?.kind == FlightKind.Back) current = null
    }

    private fun start(
        kind: FlightKind,
        mark: Rect? = null,
    ) {
        if (reduced) return
        serial += 1
        current = Flight(kind, serial, mark)
    }
}

val LocalHermesFlight = staticCompositionLocalOf<HermesFlight?> { null }

/** `ease-out` do CSS, a subida do campo. */
private val RiseEasing = CubicBezierEasing(0f, 0f, 0.58f, 1f)
private const val RISE_DELAY_MS = Motion.FLIGHT_LAND_DELAY_MS.toLong()
private const val RISE_MS = Motion.FLIGHT_LAND_MS
internal const val RISE_DISTANCE_DP = 14f

/**
 * A subida do campo enquanto o botão pousa (de 0 a 1): o texto do status, o cartão e o resto chegam de 14 dp abaixo,
 * o `flightLandDelay` do Motion depois de o voo partir. No campo de um detalhe também aparecem (a opacidade acompanha).
 */
@Composable
fun rememberHermesRise(role: MarkRole): State<Float> {
    val flight = LocalHermesFlight.current?.current
    val rising = flight != null && flight.forward && flight.role == role
    val progress = remember(flight?.serial) { Animatable(if (rising) 0f else 1f) }
    LaunchedEffect(flight?.serial) {
        if (rising) {
            delay(RISE_DELAY_MS)
            progress.animateTo(1f, tween(RISE_MS, easing = RiseEasing))
        }
    }
    return progress.asState()
}

/** O modificador da subida: deslocamento e, no detalhe, a opacidade. */
fun Modifier.hermesRise(
    rise: State<Float>,
    role: MarkRole,
): Modifier =
    graphicsLayer {
        val value = rise.value
        translationY = (1f - value) * RISE_DISTANCE_DP * density
        if (role == MarkRole.Dock) alpha = value
    }

/** O disco que voa entre o botão da barra e o ícone de status, por cima de tudo. Sem as duas pontas medidas, pousa logo. */
@Composable
fun HermesFlyer(
    flight: HermesFlight,
    bot: BotState,
) {
    val current = flight.current ?: return
    val button = flight.button
    val mark = current.mark ?: flight.mark(current.role)
    val progress = remember(current.serial) { Animatable(0f) }
    val ready = button != null && mark != null
    LaunchedEffect(current.serial, ready) {
        if (!ready) {
            delay(current.durationMillis.toLong() * 2)
            flight.land(current.serial)
            return@LaunchedEffect
        }
        progress.animateTo(1f, tween(current.durationMillis, easing = LinearEasing))
        flight.land(current.serial)
    }
    if (button == null || mark == null) return
    val density = LocalDensity.current
    val dx = mark.center.x - button.center.x
    val dy = mark.center.y - button.center.y
    val scale = mark.width / button.width
    Box(
        Modifier
            .offset { IntOffset(button.left.roundToInt(), button.top.roundToInt()) }
            .size(with(density) { button.width.toDp() })
            .graphicsLayer {
                // A volta é o mesmo caminho de trás para a frente.
                val sample = flightSample(if (current.forward) progress.value else 1f - progress.value)
                translationX = dx * sample[0]
                translationY = dy * sample[1]
                val size = 1f + (scale - 1f) * sample[2]
                scaleX = size
                scaleY = size
            },
    ) {
        HermesBot(bot, size = with(density) { button.width.toDp() }, outlined = true)
    }
}
