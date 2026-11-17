package app.braid.mobile.data.artifacts

import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactFilters
import app.braid.mobile.domain.artifact.ArtifactNotFoundException
import app.braid.mobile.domain.artifact.ArtifactRepository
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
                ).map { it.toDomain() }

        override suspend fun get(id: String): Artifact =
            try {
                api.get(id).toDomain()
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_NOT_FOUND || failure.code() == HTTP_FORBIDDEN) throw ArtifactNotFoundException(failure)
                throw failure
            }

        private companion object {
            const val HTTP_NOT_FOUND = 404
            const val HTTP_FORBIDDEN = 403
        }
    }
