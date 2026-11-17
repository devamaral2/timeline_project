package app.braid.mobile.data.agentfiles

import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.domain.agentfile.AgentFileBackup
import app.braid.mobile.domain.agentfile.AgentFileForbiddenException
import app.braid.mobile.domain.agentfile.AgentFileRepository
import app.braid.mobile.domain.agentfile.AgentFileVersion
import app.braid.mobile.domain.agentfile.HermesOffException
import app.braid.mobile.domain.request.AgentRequest
import retrofit2.HttpException
import javax.inject.Inject

class DefaultAgentFileRepository
    @Inject
    constructor(
        private val api: AgentFilesApi,
    ) : AgentFileRepository {
        override suspend fun text(path: String): String =
            try {
                api.text(path).text
            } catch (failure: HttpException) {
                if (failure.code() == HTTP_FORBIDDEN) throw AgentFileForbiddenException(failure)
                throw failure
            }

        override suspend fun backups(path: String): List<AgentFileBackup> = api.backups(path).backups.map { it.toDomain() }

        override suspend fun restore(
            path: String,
            backupId: String,
        ): AgentFileVersion? =
            api
                .restore(RestoreBackupBody(path, backupId))
                .files
                .firstOrNull { it.path == path }
                ?.toDomain()

        override suspend fun requestEdit(
            path: String,
            request: String,
            clientMessageId: String,
        ): AgentRequest =
            try {
                api.editRequest(EditRequestBody(path, request, clientMessageId)).toDomain()
            } catch (failure: HttpException) {
                // Aqui 404 é a automação desligada, não um arquivo que falta.
                if (failure.code() == HTTP_NOT_FOUND) throw HermesOffException(failure)
                throw failure
            }

        private companion object {
            const val HTTP_FORBIDDEN = 403
            const val HTTP_NOT_FOUND = 404
        }
    }
