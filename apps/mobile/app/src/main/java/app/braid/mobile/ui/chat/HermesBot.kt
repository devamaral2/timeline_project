package app.braid.mobile.ui.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.core.designsystem.svgRect

private const val BOT_GRID = 32f
private const val BOT_STROKE = 2.3f
private const val CHECK_STROKE = 3.2f

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

/** Ouvindo: a onda de cinco barras. */
private val ListeningBot =
    listOf(
        SvgPart(svgRect(3.4f, 12f, 3.2f, 8f, 1.6f), fill = true),
        SvgPart(svgRect(8.9f, 8f, 3.2f, 16f, 1.6f), fill = true),
        SvgPart(svgRect(14.4f, 4f, 3.2f, 24f, 1.6f), fill = true),
        SvgPart(svgRect(19.9f, 9f, 3.2f, 14f, 1.6f), fill = true),
        SvgPart(svgRect(25.4f, 12f, 3.2f, 8f, 1.6f), fill = true),
    )

/** Pensando: cinco pontos. */
private val ThinkingBot = listOf(5f, 10.5f, 16f, 21.5f, 27f).map { SvgPart(svgCircle(it, 16f, 2.1f), fill = true) }

/** Feito: o ✓. */
private val DoneBot = listOf(SvgPart("m8 16.5 5.5 5.5L24 10.5"))

/** Erro: a exclamação. */
private val ErrorBot = listOf(SvgPart(svgRect(14.4f, 5f, 3.2f, 15f, 1.6f), fill = true), SvgPart(svgCircle(16f, 25.4f, 2f), fill = true))

/**
 * O robô do Hermes num dos cinco estados: parado, ouvindo (a onda), pensando (cinco pontos), concluiu (o ✓) e erro
 * (a exclamação). É só um sinal: quem fala do estado é o texto ao lado. Sem a animação do web.
 */
@Composable
fun HermesBotIcon(
    state: BotState,
    size: Dp,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val parts =
        when (state) {
            BotState.Idle -> IdleBot
            BotState.Listening -> ListeningBot
            BotState.Thinking -> ThinkingBot
            BotState.Done -> DoneBot
            BotState.Error -> ErrorBot
        }
    SvgIcon(
        parts = parts,
        size = size,
        color = color,
        strokeWidth = if (state == BotState.Done) CHECK_STROKE else BOT_STROKE,
        grid = BOT_GRID,
        modifier = modifier,
    )
}
