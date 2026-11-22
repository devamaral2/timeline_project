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

    /** O pedido de edição da entidade aberta; responde 202 `{ requestId }`. */
    @POST("api/requests/edit")
    suspend fun startEdit(
        @Body body: StartEditBody,
    ): StartRequestResponseDto

    /** Responde 202 com o pedido inteiro; 404 quando o Hermes está desligado nesta API. */
    @POST("api/requests/hermes")
    suspend fun startHermes(
        @Body body: StartHermesBody,
    ): RequestDto

    /** O corpo do Hermes mais a escolha do modelo (ADR 0019); 404 sem nenhum provedor com chave, 400 com provedor sem chave. */
    @POST("api/requests/model")
    suspend fun startModel(
        @Body body: StartModelBody,
    ): RequestDto

    /** Os provedores com chave, os modelos de cada um e a escolha padrão; 404 sem nenhum provedor com chave. */
    @GET("api/requests/model/options")
    suspend fun modelOptions(): ModelOptionsDto

    /** Sem parâmetros: os 20 mais novos, do mais novo para o mais antigo. */
    @GET("api/requests")
    suspend fun recent(): List<RequestDto>

    /** Responde o pedido (já cancelado ou no estado final em que estava); 409 é o pedido de alimento. */
    @POST("api/requests/{id}/cancel")
    suspend fun cancel(
        @Path("id") id: String,
    ): RequestDto
}
