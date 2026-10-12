package app.braid.mobile.data.network

import app.braid.mobile.data.session.TokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/** Só é instalado no cliente da API; o cliente do Auth não recebe bearer. */
class AuthInterceptor
    @Inject
    constructor(
        private val tokenStore: TokenStore,
    ) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val token = runBlocking { tokenStore.read()?.accessToken }
            if (token.isNullOrBlank()) return chain.proceed(chain.request())

            val request =
                chain
                    .request()
                    .newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            return chain.proceed(request)
        }
    }
