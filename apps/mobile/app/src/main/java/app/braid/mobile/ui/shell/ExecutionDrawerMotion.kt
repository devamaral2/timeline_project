package app.braid.mobile.ui.shell

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween

/**
 * Os tempos e as curvas da gaveta de execução, os do canvas e do web: abrir leva 420 ms na curva [GrowEasing], fechar 300 ms
 * na [ShrinkEasing]; ao crescer, as linhas que entram chegam uma depois da outra. Com o sistema pedindo menos movimento,
 * toda troca é de uma vez (`snap`).
 */
object ExecutionDrawerMotion {
    const val GROW_MS = 420
    const val SHRINK_MS = 300
    const val STAGGER_MS = 40
    private const val ROW_FADE_IN_MS = 200
    private const val ROW_FADE_OUT_MS = 120
    private const val HEADER_FADE_DELAY_MS = 100

    val GrowEasing: Easing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)
    val ShrinkEasing: Easing = CubicBezierEasing(0.5f, 0f, 0.2f, 1f)

    private fun <T> tweenOrSnap(
        reduced: Boolean,
        ms: Int,
        easing: Easing,
        delay: Int = 0,
    ): FiniteAnimationSpec<T> = if (reduced) snap() else tween(ms, delay, easing)

    /** A altura da gaveta, a da lista e o giro da seta: mais devagar para abrir. */
    fun <T> height(
        grow: Boolean,
        reduced: Boolean,
    ): FiniteAnimationSpec<T> = tweenOrSnap(reduced, if (grow) GROW_MS else SHRINK_MS, if (grow) GrowEasing else ShrinkEasing)

    /** O atraso de uma linha que entra: só ao crescer, [step] vezes 40 ms. */
    private fun delayOf(
        entering: Boolean,
        step: Int,
        grow: Boolean,
    ) = if (entering && grow) step.coerceIn(0, 3) * STAGGER_MS else 0

    /** A opacidade de uma linha: entra em 200 ms e sai em 120 ms, em linha reta. */
    fun <T> rowFade(
        entering: Boolean,
        step: Int,
        grow: Boolean,
        reduced: Boolean,
    ): FiniteAnimationSpec<T> =
        tweenOrSnap(reduced, if (entering) ROW_FADE_IN_MS else ROW_FADE_OUT_MS, LinearEasing, delayOf(entering, step, grow))

    /** A subida de 8 dp de uma linha: 420 ms ao entrar, 300 ms ao sair. */
    fun <T> rowSlide(
        entering: Boolean,
        step: Int,
        grow: Boolean,
        reduced: Boolean,
    ): FiniteAnimationSpec<T> =
        tweenOrSnap(
            reduced,
            if (entering) GROW_MS else SHRINK_MS,
            if (entering) GrowEasing else ShrinkEasing,
            delayOf(entering, step, grow),
        )

    /** A opacidade do cabeçalho: some logo (120 ms) e volta depois de 100 ms, em 200. */
    fun <T> headerFade(
        visible: Boolean,
        reduced: Boolean,
    ): FiniteAnimationSpec<T> =
        tweenOrSnap(reduced, if (visible) ROW_FADE_IN_MS else ROW_FADE_OUT_MS, LinearEasing, if (visible) HEADER_FADE_DELAY_MS else 0)
}
