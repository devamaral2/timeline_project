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

    /** Responde o pedido (já cancelado ou no estado final em que estava); 409 é o pedido de alimento. */
    @POST("api/requests/{id}/cancel")
    suspend fun cancel(
        @Path("id") id: String,
    ): RequestDto
}
