package app.braid.mobile.ui.agenda

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import app.braid.mobile.core.designsystem.BraidTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class WeekStripTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun selectingAWeekDayPublishesItsCivilDate() {
        var selected: String? = null
        composeRule.setContent {
            BraidTheme {
                WeekStrip(
                    selectedDayKey = "2026-09-22",
                    todayKey = "2026-09-22",
                    onSelect = { selected = it },
                )
            }
        }

        composeRule.onNodeWithContentDescription("2026-09-23").performClick()

        assertEquals("2026-09-23", selected)
    }
}
