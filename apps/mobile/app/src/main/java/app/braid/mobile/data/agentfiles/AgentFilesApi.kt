package app.braid.mobile.data.agentfiles

import app.braid.mobile.data.requests.RequestDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/** `/api/ai/config`: os arquivos de skills e agentes do Hermes (ADR 0005). Só o dono acessa; os demais recebem 403. */
interface AgentFilesApi {
    /** O texto atual do arquivo (ou o último conhecido, se ele saiu da pasta). */
    @GET("api/ai/config/file")
    suspend fun text(
        @Query("path") path: String,
    ): AgentFileTextDto

    @GET("api/ai/config/backups")
    suspend fun backups(
        @Query("path") path: String,
    ): AgentFileBackupsDto

    /** Responde 201 com a listagem atualizada. */
    @POST("api/ai/config/restore")
    suspend fun restore(
        @Body body: RestoreBackupBody,
    ): AgentFileListDto

    /** Responde 202 com o pedido inteiro; 404 é o Hermes desligado. */
    @POST("api/ai/config/edit-request")
    suspend fun editRequest(
        @Body body: EditRequestBody,
    ): RequestDto
}
