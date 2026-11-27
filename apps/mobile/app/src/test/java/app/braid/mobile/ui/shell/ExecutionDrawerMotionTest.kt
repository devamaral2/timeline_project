package app.braid.mobile.ui.shell

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.TweenSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Os tempos e as curvas do canvas e do web: abrir 420 ms, fechar 300 ms, as linhas uma depois da outra a cada 40 ms. */
class ExecutionDrawerMotionTest {
    @Test
    fun `the timings and curves are the web's`() {
        assertEquals(420, ExecutionDrawerMotion.GROW_MS)
        assertEquals(300, ExecutionDrawerMotion.SHRINK_MS)
        assertEquals(40, ExecutionDrawerMotion.STAGGER_MS)
        assertEquals(CubicBezierEasing(0.22f, 1f, 0.36f, 1f), ExecutionDrawerMotion.GrowEasing)
        assertEquals(CubicBezierEasing(0.5f, 0f, 0.2f, 1f), ExecutionDrawerMotion.ShrinkEasing)
    }

    @Test
    fun `opening runs the grow curve for 420 ms and closing the shrink curve for 300 ms`() {
        val opening = ExecutionDrawerMotion.height<Float>(grow = true, reduced = false) as TweenSpec
        val closing = ExecutionDrawerMotion.height<Float>(grow = false, reduced = false) as TweenSpec

        assertEquals(420, opening.durationMillis)
        assertEquals(ExecutionDrawerMotion.GrowEasing, opening.easing)
        assertEquals(300, closing.durationMillis)
        assertEquals(ExecutionDrawerMotion.ShrinkEasing, closing.easing)
    }

    @Test
    fun `with the system asking for less motion every change is instant`() {
        assertTrue(ExecutionDrawerMotion.height<Float>(grow = true, reduced = true) is SnapSpec)
        assertTrue(ExecutionDrawerMotion.height<Float>(grow = false, reduced = true) is SnapSpec)
        assertTrue(ExecutionDrawerMotion.rowSlide<Float>(entering = true, step = 2, grow = true, reduced = true) is SnapSpec)
        assertTrue(ExecutionDrawerMotion.rowFade<Float>(entering = false, step = 0, grow = false, reduced = true) is SnapSpec)
    }

    @Test
    fun `rows that enter while the drawer grows arrive one after the other`() {
        fun delayOf(step: Int) =
            (ExecutionDrawerMotion.rowSlide<Float>(entering = true, step = step, grow = true, reduced = false) as TweenSpec).delay

        assertEquals(listOf(40, 80, 120), listOf(1, 2, 3).map(::delayOf))
    }

    @Test
    fun `rows have no delay when the drawer shrinks or when they leave`() {
        val shrinking = ExecutionDrawerMotion.rowSlide<Float>(entering = true, step = 2, grow = false, reduced = false) as TweenSpec
        val leaving = ExecutionDrawerMotion.rowFade<Float>(entering = false, step = 2, grow = true, reduced = false) as TweenSpec

        assertEquals(0, shrinking.delay)
        assertEquals(0, leaving.delay)
        assertEquals(120, leaving.durationMillis)
    }

    @Test
    fun `entering rows fade in 200 ms and slide in 420 ms, leaving rows fade out 120 ms and slide out 300 ms`() {
        val fadeIn = ExecutionDrawerMotion.rowFade<Float>(entering = true, step = 1, grow = false, reduced = false) as TweenSpec
        val slideIn = ExecutionDrawerMotion.rowSlide<Float>(entering = true, step = 1, grow = false, reduced = false) as TweenSpec
        val slideOut = ExecutionDrawerMotion.rowSlide<Float>(entering = false, step = 1, grow = false, reduced = false) as TweenSpec

        assertEquals(200, fadeIn.durationMillis)
        assertEquals(420, slideIn.durationMillis)
        assertEquals(300, slideOut.durationMillis)
    }

    @Test
    fun `the header takes the grow curve for 420 ms to appear and fades first when it leaves`() {
        val fadeOut = ExecutionDrawerMotion.headerFade<Float>(visible = false, reduced = false) as TweenSpec
        val fadeIn = ExecutionDrawerMotion.headerFade<Float>(visible = true, reduced = false) as TweenSpec

        assertEquals(120, fadeOut.durationMillis)
        assertEquals(200, fadeIn.durationMillis)
        assertEquals(100, fadeIn.delay)
    }
}
