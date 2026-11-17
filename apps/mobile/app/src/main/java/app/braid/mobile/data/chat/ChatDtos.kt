package app.braid.mobile.data.chat

import app.braid.mobile.domain.chat.ChatEntity
import app.braid.mobile.domain.chat.ChatEntityChange
import app.braid.mobile.domain.chat.ChatEntityKind
import app.braid.mobile.domain.chat.ChatRequest
import app.braid.mobile.domain.chat.ChatRoute
import app.braid.mobile.domain.chat.ChatStatus
import app.braid.mobile.domain.chat.ChatStep
import app.braid.mobile.domain.chat.ChatTrace
import app.braid.mobile.domain.chat.QueryTable
import app.braid.mobile.domain.chat.TraceEntry
import app.braid.mobile.domain.chat.TraceField
import app.braid.mobile.domain.chat.TraceKind
import app.braid.mobile.domain.chat.TraceRunStatus
import app.braid.mobile.domain.chat.TraceSection
import app.braid.mobile.domain.chat.TraceStatus
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import java.time.OffsetDateTime

/** `POST /api/requests` (rota por passos): o texto, a tela de onde veio, a sessão que ele continua e o id estável. */
@Serializable
data class StartRequestBody(
    val userId: String,
    val text: String,
    val context: ScreenContextDto,
    val sessionId: String? = null,
    val clientMessageId: String,
)

@Serializable
data class ScreenContextDto(
    val screen: String,
)

/** `POST /api/requests/hermes`. */
@Serializable
data class StartHermesBody(
    val userId: String,
    val text: String,
    val sessionId: String? = null,
    val clientMessageId: String,
)

@Serializable
data class StartRequestResponseDto(
    val requestId: String,
)

/** `requestSchema` do `packages/contracts` (`GET /api/requests/{id}` e a lista). */
@Serializable
data class ChatRequestDto(
    val id: String,
    val route: String,
    val status: String,
    val title: String,
    val text: String? = null,
    val steps: List<ChatStepDto> = emptyList(),
    val entities: List<ChatEntityDto> = emptyList(),
    val message: String? = null,
    val errorCode: String? = null,
    val trace: ChatTraceDto? = null,
)

@Serializable
data class ChatStepDto(
    val id: String,
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
data class ChatEntityDto(
    val kind: String,
    val id: String,
    val name: String,
    val operation: String,
)

@Serializable
data class ChatTraceDto(
    val status: String,
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
    val status: String,
    val startedAt: String? = null,
    val durationMs: Double? = null,
    val fields: List<TraceFieldDto> = emptyList(),
    val sections: List<TraceSectionDto> = emptyList(),
    val raw: JsonElement? = null,
)

private val RawJson =
    Json {
        prettyPrint = true
        prettyPrintIndent = "  "
        explicitNulls = false
    }

private fun instantMs(value: String?): Long? =
    value?.let {
        runCatching { OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull()
    }

/** `String(cell)` do web, e o JSON para objetos; a célula nula fica vazia. */
private fun cellText(cell: JsonElement): String =
    when (cell) {
        is JsonNull -> ""
        is JsonPrimitive -> cell.content
        else -> cell.toString()
    }

fun ChatRequestDto.toDomain(): ChatRequest =
    ChatRequest(
        id = id,
        route = ChatRoute.fromCode(route),
        status = ChatStatus.fromCode(status),
        title = title,
        text = text,
        steps =
            steps.map { step ->
                ChatStep(
                    step.id,
                    step.label,
                    ChatStatus.fromCode(step.status),
                    step.result?.let { QueryTable(it.columns, it.rows.map { row -> row.map(::cellText) }, it.truncated) },
                )
            },
        entities = entities.map { it.toDomain() },
        message = message,
        errorCode = errorCode,
        trace = trace?.toDomain(),
    )

fun ChatEntityDto.toDomain() =
    ChatEntity(
        kind = if (kind == "task") ChatEntityKind.Task else ChatEntityKind.Artifact,
        id = id,
        name = name,
        change =
            when (operation) {
                "create" -> ChatEntityChange.Created
                "delete" -> ChatEntityChange.Deleted
                else -> ChatEntityChange.Updated
            },
    )

fun ChatTraceDto.toDomain() =
    ChatTrace(
        status =
            when (status) {
                "done" -> TraceRunStatus.Done
                "failed" -> TraceRunStatus.Failed
                else -> TraceRunStatus.Running
            },
        startedAtMs = instantMs(startedAt),
        durationMs = durationMs,
        fields = fields.map { TraceField(it.label, it.value) },
        // Um tipo de entrada que este app não conhece some da lista em vez de derrubar o pedido.
        entries = entries.mapNotNull { it.toDomain() },
    )

fun TraceEntryDto.toDomain(): TraceEntry? {
    val traceKind = TraceKind.fromCodeOrNull(kind) ?: return null
    return TraceEntry(
        id = id,
        kind = traceKind,
        label = label,
        source = source,
        summary = summary,
        status = TraceStatus.fromCode(status),
        startedAtMs = instantMs(startedAt),
        durationMs = durationMs,
        fields = fields.map { TraceField(it.label, it.value) },
        sections = sections.map { TraceSection(it.title, it.text, it.code) },
        rawJson = RawJson.encodeToString(JsonElement.serializer(), raw ?: RawJson.encodeToJsonElement(TraceEntryDto.serializer(), this)),
    )
}
