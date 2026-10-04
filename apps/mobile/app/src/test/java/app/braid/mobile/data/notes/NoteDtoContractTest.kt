package app.braid.mobile.data.notes

import app.braid.mobile.data.dto.CreateNoteInputDto
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.UpdateNoteInput
import app.braid.mobile.data.dto.toJsonObject
import app.braid.mobile.domain.notes.noteSnippet
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** A forma que `GET /api/notes` devolve hoje (`type`/`data`/`links`) e a que o app manda de volta. */
class NoteDtoContractTest {
    // Como a produção: tolera campo novo, mas o contrato de notas precisa ser lido sem erro.
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun readsATextNoteWithItsLinks() {
        val note =
            json.decodeFromString<NoteDto>(
                """
                {"id":"n1","name":"Ideias","type":"text","schemaVersion":1,"data":{"body":"## Oi\n\nTexto"},
                 "links":[{"kind":"event","id":"e1","name":"Almoço","eventKind":"meal","at":"2026-09-11T12:00:00.000Z"}],
                 "tags":["a"],"revision":2,"createdAt":"2026-09-11T12:00:00.000Z","updatedAt":"2026-09-12T12:00:00.000Z"}
                """.trimIndent(),
            )

        assertEquals("## Oi\n\nTexto", note.content)
        assertEquals("meal", note.link?.eventKind)
        assertEquals("e1", note.link?.id)
    }

    @Test
    fun readsALooseNoteWithoutLinksAndANoteThatIsNotText() {
        val loose =
            json.decodeFromString<NoteDto>(
                """{"id":"n2","name":"Solta","type":"text","schemaVersion":1,"data":{"body":"x"},"links":[],
                   "tags":[],"revision":1,"createdAt":"2026-09-11T12:00:00.000Z","updatedAt":"2026-09-11T12:00:00.000Z"}""",
            )
        val sleep =
            json.decodeFromString<NoteDto>(
                """{"id":"n3","name":"Sono","type":"sleep","schemaVersion":1,"data":{"trackedSleepTime":420,"score":80},"links":[],
                   "tags":[],"revision":1,"createdAt":"2026-09-11T12:00:00.000Z","updatedAt":"2026-09-11T12:00:00.000Z"}""",
            )

        assertEquals(null, loose.link)
        assertEquals("", sleep.content)
        assertEquals("Sono", noteSnippet(sleep))
    }

    @Test
    fun createsATextNoteWithTypeAndData() {
        val body =
            Json
                .encodeToString(
                    CreateNoteInputDto.serializer(),
                    CreateNoteInputDto.text("Oi", "Título", listOf("a")),
                ).let(Json::parseToJsonElement)
                .jsonObject

        assertEquals(
            "Oi",
            body
                .getValue("data")
                .jsonObject
                .getValue("body")
                .let { (it as JsonPrimitive).content },
        )
        assertEquals("Título", (body.getValue("name") as JsonPrimitive).content)
        assertTrue("content" !in body)
    }

    @Test
    fun updatesTextAsTypeAndDataAndDetachesWithEmptyLists() {
        val edit = UpdateNoteInput(expectedRevision = 3, content = "Novo").toJsonObject()
        val detach = UpdateNoteInput(expectedRevision = 3, detach = true).toJsonObject()

        assertEquals("text", (edit.getValue("type") as JsonPrimitive).content)
        assertEquals("Novo", (edit.getValue("data").jsonObject.getValue("body") as JsonPrimitive).content)
        assertEquals(JsonArray(emptyList()), detach.getValue("eventIds"))
        assertEquals(JsonArray(emptyList()), detach.getValue("taskIds"))
    }
}
