package app.braid.mobile.data.artifacts

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface ArtifactsApi {
    /** Os documentos do usuário, sem as cópias; com `scope=global` e `type`, o catálogo global do tipo. Parâmetro nulo não vai na consulta. */
    @GET("api/artifacts")
    suspend fun list(
        @Query("type") type: String?,
        @Query("scope") scope: String?,
        @Query("tag") tag: String?,
        @Query("q") query: String?,
    ): List<ArtifactDto>

    @GET("api/artifacts/{id}")
    suspend fun get(
        @Path("id") id: String,
    ): ArtifactDto
}
