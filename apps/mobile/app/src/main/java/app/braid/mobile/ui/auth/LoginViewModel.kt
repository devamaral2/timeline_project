package app.braid.mobile.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.auth.AuthGateway
import app.braid.mobile.data.auth.AuthResult
import app.braid.mobile.data.network.ApiError
import app.braid.mobile.data.network.AuthErrorKind
import app.braid.mobile.data.session.SessionRepository
import app.braid.mobile.data.session.SessionSnapshot
import app.braid.mobile.data.session.SessionUser
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface LoginUiState {
    data object Idle : LoginUiState

    data object Loading : LoginUiState

    data class Error(
        val message: String,
    ) : LoginUiState
}

@HiltViewModel
class LoginViewModel
    @Inject
    constructor(
        private val authGateway: AuthGateway,
        private val sessionRepository: SessionRepository,
    ) : ViewModel() {
        private val mutableUiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)

        val uiState: StateFlow<LoginUiState> = mutableUiState.asStateFlow()

        fun submit(
            email: String,
            password: String,
        ) {
            if (email.isBlank() || password.isBlank() || mutableUiState.value == LoginUiState.Loading) return

            mutableUiState.value = LoginUiState.Loading
            viewModelScope.launch {
                when (val login = authGateway.login(email.trim(), password)) {
                    is AuthResult.Failure -> mutableUiState.value = LoginUiState.Error(login.error.userMessage())
                    is AuthResult.Success -> completeSignIn(login.value.accessToken, login.value.refreshToken)
                }
            }
        }

        private suspend fun completeSignIn(
            accessToken: String,
            refreshToken: String,
        ) {
            when (val profile = authGateway.me(accessToken)) {
                is AuthResult.Failure -> mutableUiState.value = LoginUiState.Error(profile.error.userMessage())
                is AuthResult.Success -> {
                    sessionRepository.signIn(
                        SessionSnapshot(
                            accessToken = accessToken,
                            refreshToken = refreshToken,
                            user = profile.value.toSessionUser(),
                        ),
                    )
                    mutableUiState.value = LoginUiState.Idle
                }
            }
        }
    }

private fun app.braid.mobile.data.auth.AuthUserDto.toSessionUser() =
    SessionUser(
        userId = userId,
        email = email,
        name = name,
        sessionId = sessionId,
        roles = roles,
        permissions = permissions,
        denies = denies,
    )

private fun ApiError.userMessage(): String =
    when (kind) {
        AuthErrorKind.InvalidCredentials -> "E-mail ou senha incorretos."
        AuthErrorKind.RateLimited -> "Muitas tentativas. Aguarde um pouco e tente novamente."
        AuthErrorKind.Unavailable -> "Não foi possível entrar agora. Tente novamente em instantes."
        AuthErrorKind.Protocol -> "Não foi possível concluir o login. Tente novamente."
    }
