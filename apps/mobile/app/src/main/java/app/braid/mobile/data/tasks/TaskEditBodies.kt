package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.ArtifactLink
import app.braid.mobile.domain.task.Clearable
import app.braid.mobile.domain.task.CreateTask
import app.braid.mobile.domain.task.FinishedAtChange
import app.braid.mobile.domain.task.TaskPatch
import app.braid.mobile.domain.timeline.toIsoMillis
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant

private fun Instant.json(): JsonElement = JsonPrimitive(toIsoMillis(this))

private fun <T> Clearable<T>.json(encode: (T) -> JsonElement): JsonElement = value?.let(encode) ?: JsonNull

/** O `CreateTaskInput`: só entram os campos que a pessoa preencheu, como o `buildCreateTaskInput` do web. */
fun CreateTask.toBody(): JsonObject =
    buildJsonObject {
        put("kind", kind.code)
        put("name", name)
        put("description", description)
        put("priority", priority.code)
        status?.let { put("status", it.code) }
        finishedAt?.let { put("finishedAt", it.json()) }
        startedAt?.let { put("startedAt", it.json()) }
        estimatedFinishAt?.let { put("estimatedFinishAt", it.json()) }
        location?.let { put("location", it) }
        notifyOffsetsMinutes?.let { put("notifyOffsetsMinutes", JsonArray(it.map(::JsonPrimitive))) }
        tags?.let { put("tags", JsonArray(it.map(::JsonPrimitive))) }
        projectId?.let { put("projectId", it) }
    }

/** O `PATCH` de uma edição: o campo ausente não muda e `null` apaga, então não dá para ser um DTO com padrão. */
fun TaskPatch.toBody(): JsonObject =
    buildJsonObject {
        put("expectedRevision", expectedRevision)
        kind?.let { put("kind", it.code) }
        name?.let { put("name", it) }
        description?.let { put("description", it) }
        location?.let { put("location", it.json(::JsonPrimitive)) }
        priority?.let { put("priority", it.code) }
        status?.let { put("status", it.json { code -> JsonPrimitive(code.code) }) }
        when (val change = finishedAt) {
            FinishedAtChange.Unchanged -> Unit
            FinishedAtChange.Cleared -> put("finishedAt", JsonNull)
            is FinishedAtChange.Set -> put("finishedAt", change.at.json())
        }
        startedAt?.let { put("startedAt", it.json { at -> at.json() }) }
        estimatedFinishAt?.let { put("estimatedFinishAt", it.json { at -> at.json() }) }
        notifyOffsetsMinutes?.let { put("notifyOffsetsMinutes", JsonArray(it.map(::JsonPrimitive))) }
        tags?.let { put("tags", JsonArray(it.map(::JsonPrimitive))) }
        longRunning?.let { put("longRunning", it) }
        parentTaskId?.let { put("parentTaskId", it.json(::JsonPrimitive)) }
        subtaskIds?.let { put("subtaskIds", JsonArray(it.map(::JsonPrimitive))) }
        artifacts?.let { put("artifacts", JsonArray(it.map(ArtifactLink::json))) }
        projectId?.let { put("projectId", it.json(::JsonPrimitive)) }
    }

/** Um artefato ligado vai com `id` e `relation`; a cópia nova de alimento, com `copyOf` e a quantidade, se houver. */
private fun ArtifactLink.json(): JsonElement =
    when (this) {
        is ArtifactLink.Linked ->
            buildJsonObject {
                put("id", id)
                put("relation", relation.code)
            }
        is ArtifactLink.Copy ->
            buildJsonObject {
                put("copyOf", copyOf)
                quantity?.let { put("quantity", it) }
            }
    }
