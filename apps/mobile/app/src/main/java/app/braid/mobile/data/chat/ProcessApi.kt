package app.braid.mobile.data.chat

import app.braid.mobile.data.dto.AiProcessDto
import app.braid.mobile.data.dto.StartAiProcessDto
import app.braid.mobile.data.dto.StartAiProcessResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** A rota de IA por processo (ADR 003). `POST` responde 404 enquanto ela estiver desligada no servidor. */
interface ProcessApi {
    @POST("api/ai/process")
    suspend fun startProcess(
        @Body request: StartAiProcessDto,
    ): Response<StartAiProcessResponseDto>

    @GET("api/ai/process/{id}")
    suspend fun process(
        @Path("id") id: String,
    ): Response<AiProcessDto>
}
