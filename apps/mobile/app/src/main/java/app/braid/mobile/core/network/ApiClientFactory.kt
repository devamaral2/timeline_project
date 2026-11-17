package app.braid.mobile.core.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

private val JSON_MEDIA_TYPE = "application/json".toMediaType()

private fun String.withTrailingSlash(): String = if (endsWith('/')) this else "$this/"

private fun retrofit(
    baseUrl: String,
    client: OkHttpClient,
): Retrofit =
    Retrofit
        .Builder()
        .baseUrl(baseUrl.withTrailingSlash())
        .client(client)
        .addConverterFactory(BraidJson.asConverterFactory(JSON_MEDIA_TYPE))
        .build()

/** O Auth é falado sem bearer e sem renovação: é ele quem emite e renova os tokens. */
fun <T : Any> createAuthApi(
    authBaseUrl: String,
    service: Class<T>,
): T = retrofit(authBaseUrl, OkHttpClient()).create(service)

inline fun <reified T : Any> createAuthApi(authBaseUrl: String): T = createAuthApi(authBaseUrl, T::class.java)

/** Os serviços Retrofit da API, todos com bearer, renovação num 401 e repetição única. */
class ApiClientFactory(
    apiBaseUrl: String,
    tokens: TokenProvider,
) {
    private val retrofit =
        retrofit(
            apiBaseUrl,
            OkHttpClient
                .Builder()
                .addInterceptor(BearerInterceptor(tokens))
                .authenticator(TokenAuthenticator(tokens))
                .build(),
        )

    fun <T : Any> create(service: Class<T>): T = retrofit.create(service)
}
