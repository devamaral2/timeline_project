package app.braid.mobile.data.requests

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface RequestsApi {
    @GET("api/requests/{id}")
    suspend fun request(
        @Path("id") id: String,
    ): RequestDto

    /** Responde 202 `{ requestId }`; acompanhe com [request]. */
    @POST("api/requests")
    suspend fun start(
        @Body body: StartRequestBody,
    ): StartRequestResponseDto

    /** Responde 202 com o pedido inteiro; 404 quando o Hermes está desligado nesta API. */
    @POST("api/requests/hermes")
    suspend fun startHermes(
        @Body body: StartHermesBody,
    ): RequestDto

    /** Sem parâmetros: os 20 mais novos, do mais novo para o mais antigo. */
    @GET("api/requests")
    suspend fun recent(): List<RequestDto>

    /** Responde o pedido (já cancelado ou no estado final em que estava); 409 é o pedido de alimento. */
    @POST("api/requests/{id}/cancel")
    suspend fun cancel(
        @Path("id") id: String,
    ): RequestDto
}
