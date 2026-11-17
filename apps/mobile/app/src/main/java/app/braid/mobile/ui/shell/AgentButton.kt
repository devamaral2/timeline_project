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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.core.designsystem.svgRect

private const val BOT_GRID = 32f
private const val BOT_STROKE = 2.3f

/** O robô do Hermes em repouso: antena, corpo com orelhas e os dois olhos, na grade de 32 do web. */
private val IdleBot =
    listOf(
        SvgPart("M16 9.5V6"),
        SvgPart(svgCircle(16f, 4.6f, 2f), fill = true),
        SvgPart(svgRect(5.5f, 9.5f, 21f, 16f, 5.5f)),
        SvgPart("M2.6 15.5v4"),
        SvgPart("M29.4 15.5v4"),
        SvgPart(svgCircle(12f, 17.5f, 2.1f), fill = true),
        SvgPart(svgCircle(20f, 17.5f, 2.1f), fill = true),
    )

/**
 * O botão do agente: um aro da cor da dock em volta do disco da marca com o
 * robô. Fica fora da dock, na ponta. Ainda não abre o chat: ele chega com o
 * ticket do chat; por ora o toque não faz nada.
 */
@Composable
fun AgentButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier =
            modifier
                .size(66.dp)
                .clip(CircleShape)
                .background(scheme.surface)
                .border(1.dp, scheme.outline, CircleShape)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics { contentDescription = "Buscar e criar" },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(52.dp).background(braidTokens().brand, CircleShape), contentAlignment = Alignment.Center) {
            SvgIcon(
                parts = IdleBot,
                size = 30.dp,
                color = scheme.background,
                strokeWidth = BOT_STROKE,
                grid = BOT_GRID,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}
