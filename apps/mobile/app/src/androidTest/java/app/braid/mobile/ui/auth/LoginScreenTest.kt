package app.braid.mobile.ui.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.braid.mobile.core.designsystem.BraidTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class LoginScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun happyPathSubmitsCredentials() {
        var submitted: Pair<String, String>? = null
        composeRule.setContent {
            BraidTheme {
                LoginContent(
                    email = "ana@example.com",
                    password = "secret",
                    uiState = LoginUiState.Idle,
                    onEmailChange = {},
                    onPasswordChange = {},
                    onSubmit = { submitted = "ana@example.com" to "secret" },
                )
            }
        }

        composeRule.onNodeWithText("Entrar").assertIsDisplayed().performClick()
        assertEquals("ana@example.com" to "secret", submitted)
    }

    @Test
    fun wrongCredentialsShowTheSameSafeMessageAsTheWeb() {
        composeRule.setContent {
            BraidTheme {
                LoginContent(
                    email = "ana@example.com",
                    password = "wrong",
                    uiState = LoginUiState.Error("E-mail ou senha incorretos."),
                    onEmailChange = {},
                    onPasswordChange = {},
                    onSubmit = {},
                )
            }
        }

        composeRule.onNodeWithText("E-mail ou senha incorretos.").assertIsDisplayed()
    }
}
