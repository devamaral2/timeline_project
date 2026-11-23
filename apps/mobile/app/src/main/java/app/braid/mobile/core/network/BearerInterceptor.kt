package app.braid.mobile.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/** Só o cliente da API recebe o bearer; o cliente do Auth manda credenciais no corpo. */
class BearerInterceptor(
    private val tokens: TokenProvider,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { tokens.accessToken() }
        if (token.isNullOrBlank()) return chain.proceed(chain.request())
        return chain.proceed(
            chain
                .request()
                .newBuilder()
                .header("Authorization", "Bearer $token")
                .build(),
        )
    }
}
