package app.braid.mobile.ui.event

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import app.braid.mobile.core.designsystem.BraidTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class CreateEventScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun happyPathPublishesTheFilledDraft() {
        var draft = NewEventDraft()
        var submitted: NewEventDraft? = null
        composeRule.setContent {
            BraidTheme {
                NewEventContent(
                    draft = draft,
                    state = CreateEventUiState.Idle,
                    onDraftChange = { draft = it },
                    onSubmit = { submitted = draft },
                    onBack = {},
                )
            }
        }

        composeRule.onNode(hasSetTextAction()).performTextInput("Estudar inglês")
        composeRule.onNodeWithText("Criar evento").assertIsDisplayed().performClick()

        assertEquals("Estudar inglês", submitted?.name)
        assertEquals(NewEventType.Routine, submitted?.type)
    }
}
