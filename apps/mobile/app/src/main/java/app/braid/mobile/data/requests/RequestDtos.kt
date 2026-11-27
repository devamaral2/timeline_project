package app.braid.mobile.data.requests

import app.braid.mobile.data.projects.ProjectDto
import app.braid.mobile.data.projects.toDomain
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentTrace
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOption
import app.braid.mobile.domain.request.ModelOptions
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelProviderOption
import app.braid.mobile.domain.request.ModelSelection
import app.braid.mobile.domain.request.QueryTable
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.request.RequestRoute
import app.braid.mobile.domain.request.RequestStep
import app.braid.mobile.domain.request.TraceEntry
import app.braid.mobile.domain.request.TraceField
import app.braid.mobile.domain.request.TraceKind
import app.braid.mobile.domain.request.TraceRunStatus
import app.braid.mobile.domain.request.TraceSection
import app.braid.mobile.domain.request.TraceStatus
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
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
    val project: ProjectDto,
    /** O que o usuário escreveu ou falou. */
    val text: String? = null,
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
    /** O provedor, o modelo e o esforço escolhidos para o pedido; ausente quando ele não levou escolha. */
    val model: ModelSelectionDto? = null,
)

@Serializable
data class RequestStepDto(
    val id: String,
    val agent: String,
    val label: String,
    val status: String,
    val result: QueryTableDto? = null,
)

@Serializable
data class QueryTableDto(
    val columns: List<String> = emptyList(),
    val rows: List<List<JsonElement>> = emptyList(),
    val truncated: Boolean = false,
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
    val status: String = "running",
    val startedAt: String? = null,
    val durationMs: Double? = null,
    val fields: List<TraceFieldDto> = emptyList(),
    val entries: List<TraceEntryDto> = emptyList(),
)

@Serializable
data class TraceFieldDto(
    val label: String,
    val value: String,
)

@Serializable
data class TraceSectionDto(
    val title: String,
    val text: String,
    val code: Boolean = false,
)

@Serializable
data class TraceEntryDto(
    val id: String,
    val kind: String,
    val label: String,
    val source: String? = null,
    val summary: String? = null,
    val status: String = "pending",
    val startedAt: String? = null,
    val durationMs: Double? = null,
    val fields: List<TraceFieldDto> = emptyList(),
    val sections: List<TraceSectionDto> = emptyList(),
    val raw: JsonElement? = null,
)

/** `POST /api/requests`: o texto, a sessão que ele continua (a primeira mensagem do chat não tem) e o id estável da mensagem. */
@Serializable
data class StartRequestBody(
    val userId: String,
    val text: String,
    val sessionId: String? = null,
    val clientMessageId: String,
    /** A tela de onde o pedido vem (o chat manda a Agenda). */
    val context: ScreenContextDto? = null,
    /** A escolha que o campo do chat mostra; ausente, vale o modelo do servidor. */
    val model: ModelSelectionDto? = null,
)

@Serializable
data class ScreenContextDto(
    val screen: String,
)

/** `POST /api/requests/edit`: o tipo e o id da entidade aberta; o servidor confere o tipo com a entidade de verdade. */
@Serializable
data class StartEditBody(
    val userId: String,
    val text: String,
    val entityType: String,
    val entityId: String,
    /** A escolha que o campo do detalhe mostra; ausente, vale o modelo do servidor. */
    val model: ModelSelectionDto? = null,
)

/** `POST /api/requests/hermes`. */
@Serializable
data class StartHermesBody(
    val userId: String,
    val text: String,
    val sessionId: String? = null,
    val clientMessageId: String,
)

/** `POST /api/requests/model`: o corpo do Hermes mais a escolha do modelo. */
@Serializable
data class StartModelBody(
    val userId: String,
    val text: String,
    val sessionId: String? = null,
    val clientMessageId: String,
    val model: ModelSelectionDto,
)

/** `ModelSelection` do contrato: o provedor, o id do modelo no provedor e o esforço. */
@Serializable
data class ModelSelectionDto(
    val provider: String,
    val model: String,
    val effort: String,
)

/** `modelOptionsSchema` (`GET /api/requests/model/options`). */
@Serializable
data class ModelOptionsDto(
    val providers: List<ModelProviderOptionDto> = emptyList(),
    val efforts: List<String> = emptyList(),
    val default: ModelSelectionDto,
)

@Serializable
data class ModelProviderOptionDto(
    val id: String,
    val name: String,
    val models: List<ModelOptionDto> = emptyList(),
    val defaultModel: String,
)

@Serializable
data class ModelOptionDto(
    val id: String,
    val name: String,
)

@Serializable
data class StartRequestResponseDto(
    val requestId: String,
)

private fun instantOf(value: String): Instant = OffsetDateTime.parse(value).toInstant()

private fun instantOrNull(value: String): Instant? = runCatching { instantOf(value) }.getOrNull()

private val RawJson =
    Json {
        prettyPrint = true
        prettyPrintIndent = "  "
        explicitNulls = false
    }

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
        steps = steps.map { RequestStep(it.id, it.agent, it.label, TaskStatus.fromCode(it.status), it.result?.toDomain()) },
        entities = entities.map { it.toDomain() },
        // Um tipo de entrada que este app não conhece some da lista em vez de derrubar o pedido.
        entries = trace?.entries.orEmpty().mapNotNull { it.toDomain() },
        route = RequestRoute.fromCode(route),
        text = text,
        trace = trace?.toDomain(),
        model = model?.toDomain(),
        project = project.toDomain(),
    )

fun ModelSelection.toDto() = ModelSelectionDto(provider.code, model, effort.code)

/** Um provedor ou esforço que este app não conhece some (a seleção inteira, `null`) em vez de derrubar o pedido. */
private fun ModelSelectionDto.toDomain(): ModelSelection? {
    val provider = ModelProvider.fromCodeOrNull(provider) ?: return null
    val effort = ModelEffort.fromCodeOrNull(effort) ?: return null
    return ModelSelection(provider, model, effort)
}

/** As opções do servidor; um provedor ou esforço que este app não conhece some da lista. Sem padrão legível, `null`. */
fun ModelOptionsDto.toDomain(): ModelOptions? {
    val providers =
        providers.mapNotNull { option ->
            val id = ModelProvider.fromCodeOrNull(option.id) ?: return@mapNotNull null
            ModelProviderOption(id, option.name, option.models.map { ModelOption(it.id, it.name) }, option.defaultModel)
        }
    val default = default.toDomain() ?: return null
    return ModelOptions(providers, efforts.mapNotNull(ModelEffort::fromCodeOrNull), default)
}

/** `String(cell)` do web, e o JSON para objetos; a célula nula fica vazia. */
private fun cellText(cell: JsonElement): String =
    when (cell) {
        is JsonNull -> ""
        is JsonPrimitive -> cell.content
        else -> cell.toString()
    }

private fun QueryTableDto.toDomain() = QueryTable(columns, rows.map { row -> row.map(::cellText) }, truncated)

private fun RequestTraceDto.toDomain() =
    AgentTrace(
        status =
            when (status) {
                "done" -> TraceRunStatus.Done
                "failed" -> TraceRunStatus.Failed
                else -> TraceRunStatus.Running
            },
        startedAt = startedAt?.let(::instantOrNull),
        durationMs = durationMs,
        fields = fields.map { TraceField(it.label, it.value) },
        entries = entries.mapNotNull { it.toDomain() },
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
    return TraceEntry(
        id = id,
        kind = traceKind,
        label = label,
        source = source,
        summary = summary,
        // Uma data que não se lê some da linha do tempo, como no web, em vez de derrubar o pedido.
        startedAt = startedAt?.let(::instantOrNull),
        status = TraceStatus.fromCode(status),
        durationMs = durationMs,
        fields = fields.map { TraceField(it.label, it.value) },
        sections = sections.map { TraceSection(it.title, it.text, it.code) },
        rawJson = RawJson.encodeToString(JsonElement.serializer(), raw ?: RawJson.encodeToJsonElement(TraceEntryDto.serializer(), this)),
    )
}
