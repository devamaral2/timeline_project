package app.braid.mobile.data.requests

import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.RequestStep
import app.braid.mobile.domain.request.TraceEntry
import app.braid.mobile.domain.request.TraceKind
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.OffsetDateTime

/** `requestSchema` do `packages/contracts` (`GET /api/requests/{id}`): só o que o detalhe da tarefa de agente lê. */
@Serializable
data class RequestDto(
    val id: String,
    val kind: String,
    val route: String,
    val status: String,
    val title: String,
    val sessionId: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val steps: List<RequestStepDto> = emptyList(),
    val entities: List<RequestEntityDto> = emptyList(),
    val errorCode: String? = null,
    val progress: String? = null,
    /** A resposta do Hermes quando o pedido termina (`done`). */
    val message: String? = null,
    val trace: RequestTraceDto? = null,
)

@Serializable
data class RequestStepDto(
    val id: String,
    val agent: String,
    val label: String,
    val status: String,
)

@Serializable
data class RequestEntityDto(
    val kind: String,
    val id: String,
    val name: String,
    val artifactType: String? = null,
    val operation: String,
)

@Serializable
data class RequestTraceDto(
    val entries: List<TraceEntryDto> = emptyList(),
)

@Serializable
data class TraceEntryDto(
    val id: String,
    val kind: String,
    val label: String,
    val source: String? = null,
    val summary: String? = null,
    val startedAt: String? = null,
)

/** `POST /api/requests`: o texto, a sessão que ele continua e o id estável da mensagem. */
@Serializable
data class StartRequestBody(
    val userId: String,
    val text: String,
    val sessionId: String,
    val clientMessageId: String,
)

@Serializable
data class StartRequestResponseDto(
    val requestId: String,
)

private fun instantOf(value: String): Instant = OffsetDateTime.parse(value).toInstant()

fun RequestDto.toDomain(): AgentRequest =
    AgentRequest(
        id = id,
        kind = TaskKind.fromCode(kind),
        status = TaskStatus.fromCode(status),
        title = title,
        sessionId = sessionId,
        createdAt = instantOf(createdAt),
        updatedAt = instantOf(updatedAt),
        progress = progress,
        message = message,
        errorCode = errorCode,
        steps = steps.map { RequestStep(it.id, it.agent, it.label, TaskStatus.fromCode(it.status)) },
        entities = entities.map { it.toDomain() },
        // Um tipo de entrada que este app não conhece some da lista em vez de derrubar o pedido.
        entries = trace?.entries.orEmpty().mapNotNull { it.toDomain() },
    )

private fun RequestEntityDto.toDomain() =
    RequestEntity(
        kind = if (kind == "task") EntityKind.Task else EntityKind.Artifact,
        id = id,
        name = name,
        artifactType = artifactType?.let(ArtifactType::fromCode),
        operation = RequestOperation.fromCode(operation),
    )

private fun TraceEntryDto.toDomain(): TraceEntry? {
    val traceKind = TraceKind.fromCodeOrNull(kind) ?: return null
    return TraceEntry(id, traceKind, label, source, summary, startedAt?.let(::instantOf))
}
