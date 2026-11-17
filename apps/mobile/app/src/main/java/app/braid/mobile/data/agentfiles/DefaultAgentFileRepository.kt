package app.braid.mobile.data.agentfiles

import app.braid.mobile.data.http.HTTP_FORBIDDEN
import app.braid.mobile.data.http.HTTP_NOT_FOUND
import app.braid.mobile.data.http.translatingStartFailures
import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.domain.agentfile.AgentFileBackup
import app.braid.mobile.domain.agentfile.AgentFileForbiddenException
import app.braid.mobile.domain.agentfile.AgentFileRepository
import app.braid.mobile.domain.agentfile.AgentFileVersion
import app.braid.mobile.domain.chat.ChatRequestException
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.HermesOffException
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
                translatingStartFailures { api.editRequest(EditRequestBody(path, request, clientMessageId)).toDomain() }
            } catch (failure: ChatRequestException) {
                // Aqui 404 é a automação desligada, não um arquivo que falta.
                if ((failure.cause as? HttpException)?.code() == HTTP_NOT_FOUND) throw HermesOffException(failure.cause)
                throw failure
            }
    }
