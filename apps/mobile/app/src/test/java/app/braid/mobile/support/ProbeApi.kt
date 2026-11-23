package app.braid.mobile.support

import retrofit2.http.GET

/** Uma rota qualquer da API, só para exercitar o cliente autenticado antes de haver telas. */
interface ProbeApi {
    @GET("api/probe")
    suspend fun probe(): ProbeBody
}

@kotlinx.serialization.Serializable
data class ProbeBody(
    val ok: Boolean,
)
