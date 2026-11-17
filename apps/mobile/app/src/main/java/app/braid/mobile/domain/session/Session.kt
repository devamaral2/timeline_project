package app.braid.mobile.domain.session

import kotlinx.coroutines.flow.StateFlow

data class SessionUser(
    val userId: String,
    val name: String,
    val email: String,
)

sealed interface SessionState {
    /** O app acabou de abrir e ainda não leu a sessão guardada. */
    data object Unknown : SessionState

    data object SignedOut : SessionState

    data class SignedIn(
        val user: SessionUser,
    ) : SessionState
}

enum class SignInFailure {
    InvalidCredentials,
    RateLimited,
    Unavailable,
}

sealed interface SignInResult {
    data class Success(
        val user: SessionUser,
    ) : SignInResult

    data class Failure(
        val reason: SignInFailure,
    ) : SignInResult
}

interface SessionRepository {
    val state: StateFlow<SessionState>

    /** Lê a sessão guardada ao abrir o app, sem tocar na rede. */
    suspend fun restore()

    suspend fun signIn(
        email: String,
        password: String,
    ): SignInResult

    /** Revoga o refresh token e apaga a sessão, mesmo que o Auth não responda. */
    suspend fun signOut()
}
