package app.braid.mobile.data.agentfiles

import app.braid.mobile.domain.agentfile.AgentFileBackup
import app.braid.mobile.domain.agentfile.AgentFileVersion
import kotlinx.serialization.Serializable
import java.time.OffsetDateTime

/** `AgentFileText` da API (`GET /api/ai/config/file`). */
@Serializable
data class AgentFileTextDto(
    val path: String,
    val text: String,
)

/** `AgentFileBackupList` da API: os backups sem o texto. */
@Serializable
data class AgentFileBackupsDto(
    val backups: List<AgentFileBackupDto>,
)

@Serializable
data class AgentFileBackupDto(
    val id: String,
    val path: String,
    val createdAt: String,
    val sizeBytes: Long,
)

/** `AgentFileList` da API: um arquivo da pasta, sem o texto. Só o que a restauração lê. */
@Serializable
data class AgentFileListDto(
    val files: List<AgentFileEntryDto>,
)

@Serializable
data class AgentFileEntryDto(
    val path: String,
    val hash: String,
    val missing: Boolean,
)

@Serializable
data class RestoreBackupBody(
    val path: String,
    val backupId: String,
)

@Serializable
data class EditRequestBody(
    val path: String,
    val request: String,
    val clientMessageId: String,
)

fun AgentFileBackupDto.toDomain() = AgentFileBackup(id, path, OffsetDateTime.parse(createdAt).toInstant(), sizeBytes)

fun AgentFileEntryDto.toDomain() = AgentFileVersion(path, hash, missing)
