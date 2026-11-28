package app.braid.mobile.ui.shell

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.TweenSpec
import app.braid.mobile.core.designsystem.Motion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Os tempos e as curvas do canvas e do web: os do Motion: abrir `drawerGrow`, fechar `drawerShrink`, as linhas uma depois da outra a cada `stagger`. */
class ExecutionDrawerMotionTest {
    @Test
    fun `the timings and curves are the web's`() {
        assertEquals(Motion.DRAWER_GROW_MS, ExecutionDrawerMotion.GROW_MS)
        assertEquals(Motion.DRAWER_SHRINK_MS, ExecutionDrawerMotion.SHRINK_MS)
        assertEquals(Motion.STAGGER_MS, ExecutionDrawerMotion.STAGGER_MS)
        assertEquals(CubicBezierEasing(0.22f, 1f, 0.36f, 1f), ExecutionDrawerMotion.GrowEasing)
        assertEquals(CubicBezierEasing(0.5f, 0f, 0.2f, 1f), ExecutionDrawerMotion.ShrinkEasing)
    }

    @Test
    fun `opening runs the grow curve for the grow time and closing the shrink curve for the shrink time`() {
        val opening = ExecutionDrawerMotion.height<Float>(grow = true, reduced = false) as TweenSpec
        val closing = ExecutionDrawerMotion.height<Float>(grow = false, reduced = false) as TweenSpec

        assertEquals(Motion.DRAWER_GROW_MS, opening.durationMillis)
        assertEquals(ExecutionDrawerMotion.GrowEasing, opening.easing)
        assertEquals(Motion.DRAWER_SHRINK_MS, closing.durationMillis)
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

        assertEquals(listOf(1, 2, 3).map { it * Motion.STAGGER_MS }, listOf(1, 2, 3).map(::delayOf))
    }

    @Test
    fun `rows have no delay when the drawer shrinks or when they leave`() {
        val shrinking = ExecutionDrawerMotion.rowSlide<Float>(entering = true, step = 2, grow = false, reduced = false) as TweenSpec
        val leaving = ExecutionDrawerMotion.rowFade<Float>(entering = false, step = 2, grow = true, reduced = false) as TweenSpec

        assertEquals(0, shrinking.delay)
        assertEquals(0, leaving.delay)
        assertEquals(Motion.DRAWER_ROW_OUT_MS, leaving.durationMillis)
    }

    @Test
    fun `entering rows fade in and slide in with the grow time, leaving rows fade out and slide out with the shrink time`() {
        val fadeIn = ExecutionDrawerMotion.rowFade<Float>(entering = true, step = 1, grow = false, reduced = false) as TweenSpec
        val slideIn = ExecutionDrawerMotion.rowSlide<Float>(entering = true, step = 1, grow = false, reduced = false) as TweenSpec
        val slideOut = ExecutionDrawerMotion.rowSlide<Float>(entering = false, step = 1, grow = false, reduced = false) as TweenSpec

        assertEquals(Motion.DRAWER_ROW_IN_MS, fadeIn.durationMillis)
        assertEquals(Motion.DRAWER_GROW_MS, slideIn.durationMillis)
        assertEquals(Motion.DRAWER_SHRINK_MS, slideOut.durationMillis)
    }

    @Test
    fun `the header takes the grow curve to appear and fades first when it leaves`() {
        val fadeOut = ExecutionDrawerMotion.headerFade<Float>(visible = false, reduced = false) as TweenSpec
        val fadeIn = ExecutionDrawerMotion.headerFade<Float>(visible = true, reduced = false) as TweenSpec

        assertEquals(Motion.DRAWER_ROW_OUT_MS, fadeOut.durationMillis)
        assertEquals(Motion.DRAWER_ROW_IN_MS, fadeIn.durationMillis)
        assertEquals(Motion.DRAWER_HEADER_DELAY_MS, fadeIn.delay)
    }
}
