package app.braid.mobile.data.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** DTOs espelham os contratos TypeScript de `packages/contracts/src/notes/contracts`. */
@Serializable
data class NoteLinkDto(
    /** `event` ou `task`. */
    val kind: String,
    val id: String,
    val name: String,
    /** A natureza do evento (routine, meal, training, sleep...); só para `kind = "event"`. */
    val eventKind: String? = null,
    val at: String? = null,
    val endsAt: String? = null,
)

/**
 * Uma nota: `type` + `schemaVersion` dizem que forma o `data` tem (`text` = `{ body }`;
 * refeição, sono e treino têm os números deles). `links` traz os eventos e tarefas em
 * que a nota aparece, vazio na nota solta.
 */
@Serializable
data class NoteDto(
    val id: String,
    val name: String,
    val type: String,
    val schemaVersion: Int,
    val data: JsonObject,
    val links: List<NoteLinkDto>,
    val tags: List<String>,
    val revision: Int,
    val createdAt: String,
    val updatedAt: String,
) {
    /** O markdown de uma nota de texto; vazio nas demais, que o app ainda não desenha por tipo. */
    val content: String
        get() = if (type == TEXT_NOTE_TYPE) (data["body"] as? JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty() else ""

    /** A origem principal: a primeira em que a nota aparece. */
    val link: NoteLinkDto? get() = links.firstOrNull()
}

const val TEXT_NOTE_TYPE = "text"

@Serializable
data class CreateNoteInputDto(
    val type: String,
    val data: TextNoteDataDto,
    val name: String? = null,
    val tags: List<String>? = null,
    val eventIds: List<String>? = null,
    val taskIds: List<String>? = null,
) {
    val content: String get() = data.body

    companion object {
        fun text(
            content: String,
            name: String? = null,
            tags: List<String>? = null,
        ) = CreateNoteInputDto(type = TEXT_NOTE_TYPE, data = TextNoteDataDto(content), name = name, tags = tags)
    }
}

@Serializable
data class CreateNoteResponseDto(
    val noteId: String,
)

/**
 * O PATCH de nota. Soltar a nota da origem manda `eventIds` e `taskIds` vazios (a
 * lista completa; vazia solta a nota), então o corpo é montado à mão em
 * [toJsonObject] em vez de ser um `@Serializable`.
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
            content?.let {
                put("type", JsonPrimitive(TEXT_NOTE_TYPE))
                put("data", JsonObject(mapOf("body" to JsonPrimitive(it))))
            }
            tags?.let { put("tags", JsonArray(it.map(::JsonPrimitive))) }
            if (detach) {
                put("eventIds", JsonArray(emptyList()))
                put("taskIds", JsonArray(emptyList()))
            }
        },
    )
