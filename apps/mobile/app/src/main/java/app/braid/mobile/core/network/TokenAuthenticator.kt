package app.braid.mobile.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/** Num 401, renova a sessão e repete a chamada uma única vez. */
class TokenAuthenticator(
    private val tokens: TokenProvider,
) : Authenticator {
    override fun authenticate(
        route: Route?,
        response: Response,
    ): Request? {
        if (response.attempts() >= 2) return null
        val rejected = response.request.header("Authorization")?.removePrefix("Bearer ")
        val renewed = runBlocking { tokens.renew(rejected) } ?: return null
        return response.request
            .newBuilder()
            .header("Authorization", "Bearer $renewed")
            .build()
    }

    private fun Response.attempts(): Int = generateSequence(this) { it.priorResponse }.count()
}
