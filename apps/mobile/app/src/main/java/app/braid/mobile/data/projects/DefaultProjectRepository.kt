package app.braid.mobile.data.projects

import app.braid.mobile.data.http.HTTP_BAD_REQUEST
import app.braid.mobile.data.http.HTTP_CONFLICT
import app.braid.mobile.domain.project.InvalidProjectNameException
import app.braid.mobile.domain.project.Project
import app.braid.mobile.domain.project.ProjectNameTakenException
import app.braid.mobile.domain.project.ProjectRepository
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import retrofit2.HttpException
import javax.inject.Inject

class DefaultProjectRepository
    @Inject
    constructor(
        private val api: ProjectsApi,
    ) : ProjectRepository {
        override suspend fun list(): List<Project> = api.list().map(ProjectDto::toDomain)

        override suspend fun create(name: String): Project =
            try {
                api.create(buildJsonObject { put("name", name) }).toDomain()
            } catch (failure: HttpException) {
                throw when (failure.code()) {
                    HTTP_CONFLICT -> ProjectNameTakenException(failure)
                    HTTP_BAD_REQUEST -> InvalidProjectNameException(failure)
                    else -> failure
                }
            }
    }
