package app.braid.mobile.data.artifacts

import app.braid.mobile.data.http.HTTP_CONFLICT
import app.braid.mobile.data.http.HTTP_FORBIDDEN
import app.braid.mobile.data.http.HTTP_NOT_FOUND
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactDraft
import app.braid.mobile.domain.artifact.ArtifactFilters
import app.braid.mobile.domain.artifact.ArtifactNotFoundException
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.artifact.TextContent
import app.braid.mobile.domain.task.StaleRevisionException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import retrofit2.HttpException
import javax.inject.Inject

class DefaultArtifactRepository
    @Inject
    constructor(
        private val api: ArtifactsApi,
    ) : ArtifactRepository {
        override suspend fun list(filters: ArtifactFilters): List<Artifact> =
            api
                .list(
                    type = filters.type?.code,
                    scope = if (filters.global) "global" else null,
                    tag = filters.tag?.takeIf { it.isNotBlank() },
                    query = filters.query?.trim()?.takeIf { it.isNotEmpty() },
                    limit = filters.limit,
                ).map { it.toDomain() }

        override suspend fun get(id: String): Artifact =
            try {
                api.get(id).toDomain()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_NOT_FOUND || failure.code() == HTTP_FORBIDDEN) throw ArtifactNotFoundException(failure)
                throw failure
            }

        override suspend fun create(
            draft: ArtifactDraft,
            idempotencyKey: String,
        ): String {
            val body =
                when (draft) {
                    is ArtifactDraft.Text ->
                        buildJsonObject {
                            put("type", "text")
                            draft.content.name?.let { put("name", it) }
                            put("tags", draft.content.tags.toJsonArray())
                            put("data", buildJsonObject { put("body", draft.content.body) })
                        }
                    is ArtifactDraft.Meal ->
                        buildJsonObject {
                            put("type", "food")
                            put("data", buildJsonObject { put("inputText", draft.description) })
                        }
                }
            return api.create(idempotencyKey, body).artifactId
        }

        override suspend fun updateText(
            id: String,
            revision: Int,
            text: TextContent,
        ) {
            val body =
                buildJsonObject {
                    put("expectedRevision", revision)
                    text.name?.let { put("name", it) }
                    put("tags", text.tags.toJsonArray())
                    put("type", "text")
                    put("data", buildJsonObject { put("body", text.body) })
                }
            try {
                api.update(id, body)
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_CONFLICT) throw StaleRevisionException(failure)
                throw failure
            }
        }

        override suspend fun delete(id: String) = api.delete(id)

        private fun List<String>.toJsonArray(): JsonArray = JsonArray(map { JsonPrimitive(it) })
    }
