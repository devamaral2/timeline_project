package app.braid.mobile.ui.shell

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.braid.mobile.domain.execution.ExecutionDrawerMode
import app.braid.mobile.domain.execution.shownRowCount
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** As medidas da gaveta, as do canvas e as do web (174, 254 e 46 px), e o espaço que cada tela reserva por baixo dela. */
class ExecutionDrawerLayoutTest {
    private val phone = 800.dp

    private fun bar(
        mode: ExecutionDrawerMode,
        total: Int,
        screen: Dp = phone,
    ) = ExecutionDrawerLayout.barHeight(mode, shownRowCount(mode, total), screen)

    private fun assertDp(
        expected: Dp,
        actual: Dp,
    ) = assertEquals(expected.value, actual.value, 0.01f)

    @Test
    fun `the three heights measure what the web measures`() {
        assertDp(46.dp, bar(ExecutionDrawerMode.One, 5))
        assertDp(174.dp, bar(ExecutionDrawerMode.Three, 5))
        assertDp(254.dp, bar(ExecutionDrawerMode.All, 5))
    }

    @Test
    fun `fewer runs than rows make the drawer shorter`() {
        assertDp(54.dp + 40.dp, bar(ExecutionDrawerMode.Three, 1))
        assertDp(54.dp + 80.dp, bar(ExecutionDrawerMode.All, 2))
    }

    @Test
    fun `all rows stop at 60 percent of the screen and scroll inside`() {
        assertDp(480.dp, bar(ExecutionDrawerMode.All, 50, screen = 800.dp))
        assertDp(60.dp * 6, bar(ExecutionDrawerMode.All, 50, screen = 600.dp))
        // Abaixo do teto a altura é a das linhas.
        assertDp(54.dp + 40.dp * 9, bar(ExecutionDrawerMode.All, 9, screen = 900.dp))
    }

    @Test
    fun `the space reserved is the drawer plus the 8 dp seam`() {
        assertDp(182.dp, ExecutionDrawerLayout.reserved(ExecutionDrawerMode.Three, 3, phone))
        assertDp(54.dp, ExecutionDrawerLayout.reserved(ExecutionDrawerMode.One, 1, phone))
    }

    @Test
    fun `the last row of a screen stays above the drawer at every height`() {
        // A rolagem de cada tela acaba em 120 dp + a barra do sistema + o espaço reservado; a gaveta ocupa do alto da
        // barra de navegação (82 dp + a barra do sistema) até a sua própria altura.
        for (inset in listOf(0.dp, 24.dp, 48.dp)) {
            for (screen in listOf(560.dp, 700.dp, 800.dp, 920.dp)) {
                for (mode in ExecutionDrawerMode.entries) {
                    for (total in 1..30) {
                        val shown = shownRowCount(mode, total)
                        val reserved = ExecutionDrawerLayout.reserved(mode, shown, screen)
                        val drawerTop = ExecutionDrawerLayout.drawerTopFromBottom(inset, mode, shown, screen)

                        assertTrue(
                            "$mode $total rows, screen $screen, inset $inset",
                            ExecutionDrawerLayout.scrollEnd(inset, reserved) >= drawerTop,
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `without runs a screen keeps only its own space for the navigation bar`() {
        assertDp(120.dp + 24.dp, ExecutionDrawerLayout.scrollEnd(24.dp, 0.dp))
    }
}
