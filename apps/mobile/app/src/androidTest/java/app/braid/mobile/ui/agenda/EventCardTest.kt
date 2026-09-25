package app.braid.mobile.ui.agenda

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import app.braid.mobile.core.designsystem.BraidTheme
import app.braid.mobile.data.dto.TimelineEventCardDto
import org.junit.Rule
import org.junit.Test

class EventCardTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun runningMealShowsNowStopwatchTagsAndMissedBadge() {
        composeRule.setContent {
            BraidTheme {
                EventCard(
                    event =
                        TimelineEventCardDto(
                            id = "meal-1",
                            primaryItemId = "meal-item-1",
                            primaryItemType = "meal",
                            itemTypes = listOf("meal"),
                            missed = true,
                            name = "Café da manhã",
                            description = "Aveia e frutas",
                            startedAt = "2026-09-22T08:00:00Z",
                            finishedAt = null,
                            notifyOffsetsMinutes = emptyList(),
                            durationLabel = "--",
                            tags = listOf("foco"),
                            interruptions = emptyList(),
                        ),
                    longestMinutes = 60,
                    now = java.time.Instant.parse("2026-09-22T08:04:05Z"),
                )
            }
        }

        composeRule.onNodeWithText("Refeição").assertIsDisplayed()
        composeRule.onNodeWithText("Café da manhã").assertIsDisplayed()
        composeRule.onNodeWithText("Agora").assertIsDisplayed()
        composeRule.onNodeWithText("04:05").assertIsDisplayed()
        composeRule.onNodeWithText("#foco").assertIsDisplayed()
        composeRule.onNodeWithText("Não realizado").assertIsDisplayed()
    }
}
