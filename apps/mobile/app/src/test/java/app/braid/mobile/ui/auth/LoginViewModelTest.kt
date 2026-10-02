package app.braid.mobile.ui.auth

import app.braid.mobile.data.auth.AuthGateway
import app.braid.mobile.data.auth.AuthResult
import app.braid.mobile.data.auth.AuthUserDto
import app.braid.mobile.data.auth.SessionTokensDto
import app.braid.mobile.data.network.ApiError
import app.braid.mobile.data.network.AuthErrorKind
import app.braid.mobile.data.session.SessionRepository
import app.braid.mobile.data.session.SessionState
import app.braid.mobile.data.session.TokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun successfulLoginFetchesProfileAndPersistsSession() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val gateway = FakeAuthGateway()
            val repository = SessionRepository(FakeTokenStore())
            val viewModel = LoginViewModel(gateway, repository)

            viewModel.submit(" ana@example.com ", "secret")
            advanceUntilIdle()

            assertEquals("ana@example.com", gateway.loginEmail)
            assertEquals("secret", gateway.loginPassword)
            assertEquals(SessionState.SignedIn(gateway.user.toSessionUserForTest()), repository.state.value)
            assertEquals(LoginUiState.Idle, viewModel.uiState.value)
        }
    }

    @Test
    fun invalidCredentialsAreExposedWithoutRevealingWhichFieldFailed() {
        runTest {
            Dispatchers.setMain(StandardTestDispatcher(testScheduler))
            val repository = SessionRepository(FakeTokenStore())
            val viewModel = LoginViewModel(FakeAuthGateway(invalidCredentials = true), repository)

            viewModel.submit("ana@example.com", "wrong")
            advanceUntilIdle()

            assertEquals(LoginUiState.Error("E-mail ou senha incorretos."), viewModel.uiState.value)
            assertEquals(SessionState.Unknown, repository.state.value)
        }
    }

    private class FakeAuthGateway(
        private val invalidCredentials: Boolean = false,
    ) : AuthGateway {
        var loginEmail: String? = null
        var loginPassword: String? = null
        val user =
            AuthUserDto(
                "user-1",
                "ana@example.com",
                "Ana",
                "session-1",
            )

        override suspend fun login(
            email: String,
            password: String,
        ): AuthResult<SessionTokensDto> {
            loginEmail = email
            loginPassword = password
            return if (invalidCredentials) {
                AuthResult.Failure(ApiError(AuthErrorKind.InvalidCredentials, 401))
            } else {
                AuthResult.Success(SessionTokensDto("access", "refresh"))
            }
        }

        override suspend fun refresh(refreshToken: String): AuthResult<SessionTokensDto> = error("not used")

        override suspend fun logout(refreshToken: String): AuthResult<Unit> = error("not used")

        override suspend fun me(accessToken: String): AuthResult<AuthUserDto> = AuthResult.Success(user)
    }

    private class FakeTokenStore : TokenStore {
        private var value: app.braid.mobile.data.session.SessionSnapshot? = null

        override suspend fun read() = value

        override suspend fun write(snapshot: app.braid.mobile.data.session.SessionSnapshot) {
            value = snapshot
        }

        override suspend fun clear() {
            value = null
        }
    }
}

private fun AuthUserDto.toSessionUserForTest() =
    app.braid.mobile.data.session.SessionUser(
        userId = userId,
        email = email,
        name = name,
        sessionId = sessionId,
        roles = roles,
        permissions = permissions,
        denies = denies,
    )
