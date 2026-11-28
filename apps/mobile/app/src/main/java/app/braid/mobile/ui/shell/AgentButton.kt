package app.braid.mobile.ui.shell

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.Motion
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.ui.chat.BotState
import app.braid.mobile.ui.chat.FlightKind
import app.braid.mobile.ui.chat.HermesBot
import app.braid.mobile.ui.chat.LocalHermesFlight
import kotlinx.coroutines.delay

/**
 * O botão do agente: um aro da cor da dock, sobre o fundo da dock, em volta do robô, que tem a cor dos outros ícones. Fica fora da dock, na ponta. O robô
 * acompanha o chat mesmo fechado ([bot]: pensa enquanto a IA responde e mostra o desfecho por um instante); com o chat
 * aberto vira um X que o fecha.
 */
@Composable
fun AgentButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    bot: BotState = BotState.Idle,
    chatOpen: Boolean = false,
    /** Com o menu da seção aberto a dock passa por baixo do círculo e o aro some. */
    blended: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier =
            modifier
                .size(58.dp)
                .clip(CircleShape)
                .background(if (blended) Color.Transparent else scheme.surface)
                .border(1.dp, if (blended) Color.Transparent else scheme.outline, CircleShape)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics { contentDescription = if (chatOpen) "Fechar chat com IA" else "Buscar e criar" },
        contentAlignment = Alignment.Center,
    ) {
        AgentCore(bot = bot, chatOpen = chatOpen)
    }
}

/** `closeEnter` do web: o X que fica no lugar do botão que voou. */
private val CloseEnterEasing = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)
private const val CLOSE_ENTER_DELAY_MS = Motion.CLOSE_ENTER_DELAY_MS.toLong()
private const val CLOSE_ENTER_MS = Motion.CLOSE_ENTER_MS
private const val CORE_AWAY_MS = Motion.CORE_AWAY_MS
private const val CLOSE_ENTER_SCALE = 0.6f
private val CoreSize = 46.dp

/**
 * O disco do botão: o robô, ou o X com o chat aberto. Avisa ao voo onde está; quando o robô sai voando o X surge
 * crescendo; quando ele volta, o disco se apaga até o pouso; entrando e saindo de um detalhe, fica escondido.
 */
@Composable
private fun AgentCore(
    bot: BotState,
    chatOpen: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    val flightState = LocalHermesFlight.current
    val flight = flightState?.current
    val core = remember(flight?.serial) { Animatable(if (flight?.kind == FlightKind.Out) 0f else 1f) }
    LaunchedEffect(flight?.serial) {
        when (flight?.kind) {
            FlightKind.Out -> {
                delay(CLOSE_ENTER_DELAY_MS)
                core.animateTo(1f, tween(CLOSE_ENTER_MS, easing = CloseEnterEasing))
            }
            FlightKind.Back -> core.animateTo(0f, tween(CORE_AWAY_MS))
            else -> Unit
        }
    }
    val hidden = flight?.kind == FlightKind.Dock || flight?.kind == FlightKind.Undock
    val entering = flight?.kind == FlightKind.Out
    Box(
        Modifier
            .size(CoreSize)
            .onGloballyPositioned { flightState?.buttonMoved(it.boundsInRoot()) }
            .graphicsLayer {
                alpha = if (hidden) 0f else core.value
                val grow = if (entering) CLOSE_ENTER_SCALE + (1f - CLOSE_ENTER_SCALE) * core.value else 1f
                scaleX = grow
                scaleY = grow
            },
        contentAlignment = Alignment.Center,
    ) {
        if (chatOpen) {
            Box(Modifier.size(CoreSize).background(braidTokens().brand, CircleShape), contentAlignment = Alignment.Center) {
                SvgIcon(
                    BraidIcons.close,
                    size = 26.dp,
                    color = scheme.background,
                    strokeWidth = 2f,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
        } else {
            HermesBot(bot, size = CoreSize, outlined = true)
        }
    }
}
