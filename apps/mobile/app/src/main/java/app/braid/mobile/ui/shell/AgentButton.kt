package app.braid.mobile.ui.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.ui.chat.BotState
import app.braid.mobile.ui.chat.HermesBotIcon

/**
 * O botão do agente: um aro da cor da dock em volta do disco da marca com o robô. Fica fora da dock, na ponta. O robô
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
                .size(66.dp)
                .clip(CircleShape)
                .background(if (blended) Color.Transparent else scheme.surface)
                .border(1.dp, if (blended) Color.Transparent else scheme.outline, CircleShape)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics { contentDescription = if (chatOpen) "Fechar chat com IA" else "Buscar e criar" },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(52.dp).background(braidTokens().brand, CircleShape), contentAlignment = Alignment.Center) {
            if (chatOpen) {
                SvgIcon(
                    BraidIcons.close,
                    size = 26.dp,
                    color = scheme.background,
                    strokeWidth = 2f,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            } else {
                HermesBotIcon(bot, size = 30.dp, color = scheme.background, modifier = Modifier.clearAndSetSemantics {})
            }
        }
    }
}
