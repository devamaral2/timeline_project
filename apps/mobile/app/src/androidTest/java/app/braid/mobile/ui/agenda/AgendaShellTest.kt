package app.braid.mobile.ui.agenda

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.braid.mobile.core.designsystem.BraidTheme
import app.braid.mobile.data.session.SessionUser
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AgendaShellTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun menuExposesAccountActionsAndLogout() {
        var signedOut = false
        composeRule.setContent {
            BraidTheme {
                AgendaShell(
                    user = SessionUser("user-1", "ana@example.com", "Ana", "session-1"),
                    onSignOut = { signedOut = true },
                )
            }
        }

        composeRule.onNodeWithContentDescription("Abrir menu").performClick()
        composeRule.onNodeWithText("ana@example.com").assertIsDisplayed()
        composeRule.onNodeWithText("Sair da conta").performClick()

        assertTrue(signedOut)
    }
}
