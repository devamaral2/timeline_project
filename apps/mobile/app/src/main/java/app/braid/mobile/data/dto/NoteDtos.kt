package app.braid.mobile.data.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** DTOs espelham os contratos TypeScript de `packages/contracts/src/notes/contracts`. */
@Serializable
data class NoteLinkDto(
    /** `event` ou `task`. */
    val kind: String,
    val id: String,
    val name: String,
    val eventType: String? = null,
    val at: String? = null,
)

@Serializable
data class NoteDto(
    val id: String,
    val name: String,
    val content: String,
    val eventId: String? = null,
    val taskId: String? = null,
    val link: NoteLinkDto? = null,
    val tags: List<String>,
    val revision: Int,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class CreateNoteInputDto(
    val content: String,
    val name: String? = null,
    val eventId: String? = null,
    val taskId: String? = null,
    val tags: List<String>? = null,
)

@Serializable
data class CreateNoteResponseDto(
    val noteId: String,
)

/**
 * O PATCH de nota. `eventId` e `taskId` aceitam `null` explícito para soltar a
 * nota do alvo — e o serializador do app omite nulos —, então o corpo é montado
 * à mão em [toJsonObject] em vez de ser um `@Serializable`.
 */
data class UpdateNoteInput(
    val expectedRevision: Int,
    val name: String? = null,
    val content: String? = null,
    val tags: List<String>? = null,
    /** Solta a nota do evento ou da tarefa a que ela está presa. */
    val detach: Boolean = false,
)

fun UpdateNoteInput.toJsonObject(): JsonObject =
    JsonObject(
        buildMap {
            put("expectedRevision", JsonPrimitive(expectedRevision))
            name?.let { put("name", JsonPrimitive(it)) }
            content?.let { put("content", JsonPrimitive(it)) }
            tags?.let { put("tags", JsonArray(it.map(::JsonPrimitive))) }
            if (detach) {
                put("eventId", JsonNull)
                put("taskId", JsonNull)
            }
        },
    )
