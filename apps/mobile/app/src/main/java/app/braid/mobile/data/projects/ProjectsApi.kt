package app.braid.mobile.data.projects

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** `GET /api/projects` e `POST /api/projects`, as mesmas rotas que o web usa. */
interface ProjectsApi {
    @GET("api/projects")
    suspend fun list(): List<ProjectDto>

    /** O corpo é `{ name }`; responde 201 com o projeto, 409 para nome repetido e 400 para nome inválido. */
    @POST("api/projects")
    suspend fun create(
        @Body body: JsonObject,
    ): ProjectDto
}

/** `projectSchema` do `packages/contracts`: o projeto viaja como `{ id, name, personal }`. */
@Serializable
data class ProjectDto(
    val id: String,
    val name: String,
    val personal: Boolean,
)
