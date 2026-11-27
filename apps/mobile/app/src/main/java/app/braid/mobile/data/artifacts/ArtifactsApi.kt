package app.braid.mobile.data.artifacts

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ArtifactsApi {
    /** Os artefatos do usuário, sem as cópias; com `scope=global` e `type`, o catálogo global do tipo. Parâmetro nulo não vai na consulta. */
    @GET("api/artifacts")
    suspend fun list(
        @Query("type") type: String?,
        @Query("scope") scope: String?,
        @Query("tag") tag: String?,
        @Query("q") query: String?,
        @Query("limit") limit: Int? = null,
    ): List<ArtifactDto>

    @GET("api/artifacts/{id}")
    suspend fun get(
        @Path("id") id: String,
    ): ArtifactDto

    /** Responde 201 `{ artifactId }`; a chave evita criar duas vezes o mesmo artefato. */
    @POST("api/artifacts")
    suspend fun create(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body body: JsonObject,
    ): CreateArtifactResponseDto

    /** Responde 204; 409 é a revisão velha. */
    @PATCH("api/artifacts/{id}")
    suspend fun update(
        @Path("id") id: String,
        @Body body: JsonObject,
    )

    /** Responde 204. */
    @DELETE("api/artifacts/{id}")
    suspend fun delete(
        @Path("id") id: String,
    )
}
