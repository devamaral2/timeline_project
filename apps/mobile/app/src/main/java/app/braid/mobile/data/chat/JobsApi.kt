package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AiJobDto
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Jobs duráveis de IA do servidor; hoje só a captura por voz os usa. */
interface JobsApi {
    @GET("api/ai/jobs")
    suspend fun listJobs(): Response<List<AiJobDto>>

    @GET("api/ai/jobs/{id}")
    suspend fun job(
        @Path("id") id: String,
    ): Response<AiJobDto>

    @POST("api/ai/jobs/{id}/cancel")
    suspend fun cancelJob(
        @Path("id") id: String,
    ): Response<AiJobDto>
}
