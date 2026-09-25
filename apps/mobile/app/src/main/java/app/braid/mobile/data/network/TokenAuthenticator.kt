package app.braid.mobile.data.network

import app.braid.mobile.data.auth.AuthApi
import app.braid.mobile.data.auth.RefreshTokenRequestDto
import app.braid.mobile.data.session.SessionRepository
import app.braid.mobile.data.session.TokenStore
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject

/** Renova uma vez por resposta 401 e serializa refreshes concorrentes. */
class TokenAuthenticator
    @Inject
    constructor(
        private val tokenStore: TokenStore,
        private val sessionRepository: SessionRepository,
        private val authApi: AuthApi,
    ) : Authenticator {
        private val refreshMutex = Mutex()

        override fun authenticate(
            route: Route?,
            response: Response,
        ): Request? {
            if (responseCount(response) >= 2) return null

            val failedAccessToken = response.request.header("Authorization")?.removePrefix("Bearer ")
            return runBlocking {
                refreshMutex.withLock {
                    val current = tokenStore.read() ?: return@withLock null

                    // Outra requisição já terminou o refresh enquanto esta esperava.
                    if (!failedAccessToken.isNullOrBlank() && current.accessToken != failedAccessToken) {
                        return@withLock response.request.withBearer(current.accessToken)
                    }

                    val refreshed =
                        runCatching {
                            authApi.refresh(RefreshTokenRequestDto(current.refreshToken))
                        }.getOrNull()
                    val tokens = refreshed?.takeIf { it.isSuccessful }?.body()
                    if (tokens == null) {
                        sessionRepository.signOut()
                        return@withLock null
                    }

                    tokenStore.write(current.copy(accessToken = tokens.accessToken, refreshToken = tokens.refreshToken))
                    response.request.withBearer(tokens.accessToken)
                }
            }
        }
    }

private fun Request.withBearer(accessToken: String): Request =
    newBuilder()
        .header("Authorization", "Bearer $accessToken")
        .build()

private fun responseCount(response: Response): Int {
    var count = 1
    var prior = response.priorResponse
    while (prior != null) {
        count++
        prior = prior.priorResponse
    }
    return count
}
