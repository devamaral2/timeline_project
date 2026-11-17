package app.braid.mobile.domain.agentfile

import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.HermesOffException
import java.time.Instant

/** Um backup de um arquivo do Hermes, sem o texto (a API não o devolve). A lista vem do mais novo para o mais antigo. */
data class AgentFileBackup(
    val id: String,
    val path: String,
    val createdAt: Instant,
    val sizeBytes: Long,
)

/** O que a restauração devolve do arquivo: a versão nova e se ele ainda está na pasta. */
data class AgentFileVersion(
    val path: String,
    val hash: String,
    val missing: Boolean,
)

/**
 * Os arquivos do agente (skills e agentes do Hermes, ADR 0005). Só o dono acessa: para quem não é, a leitura do texto
 * sobe como [AgentFileForbiddenException].
 */
interface AgentFileRepository {
    /** O texto atual do arquivo, ou o último conhecido se ele saiu da pasta. */
    suspend fun text(path: String): String

    /** Os backups do arquivo, do mais novo para o mais antigo. */
    suspend fun backups(path: String): List<AgentFileBackup>

    /**
     * Restaura o backup. O texto substituído vira um backup novo, então a restauração se desfaz. Devolve a versão
     * nova do arquivo, ou `null` se a listagem que a API devolveu não o traz.
     */
    suspend fun restore(
        path: String,
        backupId: String,
    ): AgentFileVersion?

    /**
     * Pede ao Hermes uma edição do arquivo e devolve o pedido inteiro; acompanhe com a leitura do pedido. Reenviar o
     * mesmo [clientMessageId] devolve o pedido já aceito. Com o Hermes desligado (404), sobe [HermesOffException].
     */
    suspend fun requestEdit(
        path: String,
        request: String,
        clientMessageId: String,
    ): AgentRequest
}

/** O usuário não é o dono do servidor: a seção do arquivo some, sem erro. */
class AgentFileForbiddenException(
    cause: Throwable? = null,
) : Exception("Só o dono lê os arquivos do agente.", cause)
