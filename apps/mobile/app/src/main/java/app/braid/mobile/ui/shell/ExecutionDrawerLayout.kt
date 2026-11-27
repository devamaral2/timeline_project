package app.braid.mobile.ui.shell

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.braid.mobile.domain.execution.ExecutionDrawerMode

/**
 * As medidas da gaveta de execução, as do web (`execution-drawer.module.css`): linha de 40 dp, linha recolhida e
 * cabeçalho de 44 dp, a borda de 1 dp nos dois lados, 2 dp de respiro em cima e 6 embaixo. Passando de 60% da altura da
 * tela, a lista rola por dentro. É funções puras, em [Dp], para conferir contra os números do web.
 */
object ExecutionDrawerLayout {
    val Row = 40.dp
    val One = 44.dp
    val Header = 44.dp

    /** O que a tela por baixo reserva além da gaveta: o respiro entre ela e o fim da rolagem. */
    val Seam = 8.dp

    /** O que cada tela já reserva por baixo para a barra de navegação (mais a barra do sistema). */
    val NavigationReserve = 120.dp

    /** O alto da barra de navegação: o círculo de 58 dp e os 16 dp de baixo. A gaveta senta acima dela. */
    val NavigationHeight = 74.dp

    /** O respiro do fundo da gaveta, entre ela e a barra de navegação. */
    val DockGap = 8.dp

    const val CAP_FRACTION = 0.6f

    /** Borda, respiro e cabeçalho (o `--chrome`); numa linha só é a borda. */
    fun chrome(mode: ExecutionDrawerMode): Dp = if (mode == ExecutionDrawerMode.One) 2.dp else 54.dp

    /** A altura da lista: as linhas à mostra, ou a linha recolhida; passando do teto de 60% da tela, o teto. */
    fun listHeight(
        mode: ExecutionDrawerMode,
        shown: Int,
        screen: Dp,
    ): Dp {
        val list = if (mode == ExecutionDrawerMode.One) One else Row * shown
        val cap = (screen * CAP_FRACTION - chrome(mode)).coerceAtLeast(0.dp)
        return minOf(list, cap)
    }

    /** A altura da barra da gaveta inteira, com a borda. */
    fun barHeight(
        mode: ExecutionDrawerMode,
        shown: Int,
        screen: Dp,
    ): Dp = listHeight(mode, shown, screen) + chrome(mode)

    /** O que a tela por baixo reserva no fim: a altura da gaveta mais o respiro. */
    fun reserved(
        mode: ExecutionDrawerMode,
        shown: Int,
        screen: Dp,
    ): Dp = barHeight(mode, shown, screen) + Seam

    /** Até onde a rolagem de uma tela vai: a reserva da barra de navegação e a da gaveta. */
    fun scrollEnd(
        systemInset: Dp,
        reserved: Dp,
    ): Dp = NavigationReserve + systemInset + reserved

    /** A distância do alto da gaveta até o pé da tela. */
    fun drawerTopFromBottom(
        systemInset: Dp,
        mode: ExecutionDrawerMode,
        shown: Int,
        screen: Dp,
    ): Dp = systemInset + NavigationHeight + DockGap + barHeight(mode, shown, screen)
}

/**
 * A altura que a gaveta reserva agora, animada junto com ela. As telas a leem na fase de layout (`ExecutionReserveSpacer`),
 * então a animação não recompõe a lista.
 */
@Stable
class ExecutionReserve {
    var height: Dp by mutableStateOf(0.dp)
}
