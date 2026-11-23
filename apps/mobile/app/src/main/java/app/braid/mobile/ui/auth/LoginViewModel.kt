package app.braid.mobile.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SignInFailure
import app.braid.mobile.domain.session.SignInResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Os mesmos limites do `maxLength` do formulário web, que são os do Auth. */
private const val EMAIL_MAX_LENGTH = 320
private const val PASSWORD_MAX_LENGTH = 1024

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val submitting: Boolean = false,
    val error: String? = null,
) {
    val canSubmit: Boolean get() = !submitting && email.isNotEmpty() && password.isNotEmpty()
}

@HiltViewModel
class LoginViewModel
    @Inject
    constructor(
        private val session: SessionRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(LoginUiState())
        val state: StateFlow<LoginUiState> = mutableState.asStateFlow()

        fun onEmailChange(value: String) = mutableState.update { it.copy(email = value.take(EMAIL_MAX_LENGTH)) }

        fun onPasswordChange(value: String) = mutableState.update { it.copy(password = value.take(PASSWORD_MAX_LENGTH)) }

        fun submit() {
            val current = mutableState.value
            if (!current.canSubmit) return
            mutableState.update { it.copy(submitting = true, error = null) }
            viewModelScope.launch {
                val result = session.signIn(current.email.trim(), current.password)
                // Entrando, o estado da sessão troca a tela; só a falha fica aqui.
                mutableState.update {
                    when (result) {
                        is SignInResult.Success -> it.copy(submitting = false)
                        is SignInResult.Failure -> it.copy(submitting = false, error = result.reason.message())
                    }
                }
            }
        }
    }

private fun SignInFailure.message(): String =
    when (this) {
        // Nunca diz qual dos dois estava errado: o Auth também não diz.
        SignInFailure.InvalidCredentials -> "E-mail ou senha incorretos."
        SignInFailure.RateLimited -> "Muitas tentativas. Aguarde um pouco e tente novamente."
        SignInFailure.Unavailable -> "Não foi possível entrar agora. Tente novamente em instantes."
    }
