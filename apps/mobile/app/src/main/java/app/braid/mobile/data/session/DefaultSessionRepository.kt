package app.braid.mobile.data.session

import app.braid.mobile.core.network.TokenProvider
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.session.SessionUser
import app.braid.mobile.domain.session.SignInFailure
import app.braid.mobile.domain.session.SignInResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerializationException
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/** O resultado de uma chamada ao Auth: o corpo, ou por que ela não deu certo. */
private sealed interface AuthOutcome<out T> {
    data class Ok<T>(
        val body: T,
    ) : AuthOutcome<T>

    data class Failed(
        val status: Int?,
    ) : AuthOutcome<Nothing>
}

private suspend fun <T> callAuth(request: suspend () -> Response<T>): AuthOutcome<T> =
    try {
        val response = request()
        val body = response.body()
        if (response.isSuccessful && body != null) AuthOutcome.Ok(body) else AuthOutcome.Failed(response.code())
    } catch (_: IOException) {
        AuthOutcome.Failed(null)
    } catch (_: SerializationException) {
        AuthOutcome.Failed(null)
    }

/**
 * A sessão do app: entra pelo Auth, guarda o par de tokens e renova quando a API
 * recusa o access token. É o único dono do estado "entrou ou não".
 */
@Singleton
class DefaultSessionRepository
    @Inject
    constructor(
        private val storage: SessionStorage,
        private val authApi: AuthApi,
    ) : SessionRepository,
        TokenProvider {
        private val mutableState = MutableStateFlow<SessionState>(SessionState.Unknown)
        private val renewal = Mutex()

        override val state: StateFlow<SessionState> = mutableState.asStateFlow()

        override suspend fun restore() {
            mutableState.value = storage.read()?.let { SessionState.SignedIn(it.toUser()) } ?: SessionState.SignedOut
        }

        override suspend fun signIn(
            email: String,
            password: String,
        ): SignInResult {
            val tokens =
                when (val outcome = callAuth { authApi.login(LoginRequestDto(email, password)) }) {
                    is AuthOutcome.Ok -> outcome.body
                    is AuthOutcome.Failed -> return SignInResult.Failure(outcome.status.toSignInFailure())
                }
            // Sem o usuário não há sessão: o web também falha aqui como "indisponível".
            val current =
                when (val outcome = callAuth { authApi.me("Bearer ${tokens.accessToken}") }) {
                    is AuthOutcome.Ok -> outcome.body
                    is AuthOutcome.Failed -> return SignInResult.Failure(SignInFailure.Unavailable)
                }
            val session = StoredSession(tokens.accessToken, tokens.refreshToken, current.userId, current.email, current.name)
            storage.write(session)
            mutableState.value = SessionState.SignedIn(session.toUser())
            return SignInResult.Success(session.toUser())
        }

        override suspend fun signOut() {
            // O logout do Auth é idempotente; sem ele no ar a pessoa sai do mesmo jeito.
            storage.read()?.let { callAuth { authApi.logout(RefreshRequestDto(it.refreshToken)) } }
            clearSession()
        }

        override suspend fun accessToken(): String? = storage.read()?.accessToken

        override suspend fun renew(rejectedAccessToken: String?): String? =
            renewal.withLock {
                val current = storage.read() ?: return@withLock null
                // Outra chamada terminou a renovação enquanto esta esperava na fila.
                if (rejectedAccessToken != null && current.accessToken != rejectedAccessToken) return@withLock current.accessToken

                when (val outcome = callAuth { authApi.refresh(RefreshRequestDto(current.refreshToken)) }) {
                    is AuthOutcome.Ok -> {
                        val renewed = current.copy(accessToken = outcome.body.accessToken, refreshToken = outcome.body.refreshToken)
                        storage.write(renewed)
                        renewed.accessToken
                    }
                    is AuthOutcome.Failed -> {
                        // Refresh recusado (expirado, revogado, reusado) encerra a sessão. Uma queda do
                        // Auth, não: o app mantém a sessão para a próxima tentativa.
                        if (outcome.status != null && outcome.status in 400..499) clearSession()
                        null
                    }
                }
            }

        private suspend fun clearSession() {
            storage.clear()
            mutableState.value = SessionState.SignedOut
        }
    }

private fun Int?.toSignInFailure(): SignInFailure =
    when (this) {
        // O Auth não diz qual dos dois estava errado; o web também trata qualquer 4xx assim.
        429 -> SignInFailure.RateLimited
        in 400..499 -> SignInFailure.InvalidCredentials
        else -> SignInFailure.Unavailable
    }

private fun StoredSession.toUser() = SessionUser(userId = userId, name = name, email = email)
