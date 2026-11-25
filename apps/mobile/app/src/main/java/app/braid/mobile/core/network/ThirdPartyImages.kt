package app.braid.mobile.core.network

import android.content.Context
import coil3.ImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response

/**
 * As imagens de um documento vêm de servidores de terceiros. O cliente delas é um [OkHttpClient] novo, fora do
 * `ApiClientFactory`: sem o bearer, sem o `Authenticator` e sem cookies, e o interceptor abaixo tira o que
 * sobrar de identificação, inclusive no que um redirecionamento carregar. Nunca reuse o cliente da API aqui.
 */
fun thirdPartyHttpClient(): OkHttpClient = OkHttpClient.Builder().addNetworkInterceptor(StripIdentity).build()

private object StripIdentity : Interceptor {
    private val IDENTITY = listOf("Referer", "Authorization", "Cookie", "Origin")

    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
        IDENTITY.forEach { builder.removeHeader(it) }
        return chain.proceed(builder.build())
    }
}

@Volatile
private var imageLoader: ImageLoader? = null

/** O carregador de imagens dos documentos, um só para o app, sobre [thirdPartyHttpClient]. */
fun thirdPartyImageLoader(context: Context): ImageLoader =
    imageLoader ?: synchronized(StripIdentity) {
        imageLoader ?: ImageLoader
            .Builder(context.applicationContext)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { thirdPartyHttpClient() })) }
            .build()
            .also { imageLoader = it }
    }
