package app.braid.mobile.domain.notes

import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.NoteLinkDto
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** Espelha `apps/web/src/lib/notes/notes-model.test.ts`: web e app têm de falar a mesma língua. */
class NotesModelTest {
    // Segunda, 14 de setembro de 2026, 10:00 no fuso da timeline (UTC-3).
    private val now = Instant.parse("2026-09-14T13:00:00Z")

    private fun note(
        id: String = "nota-1",
        name: String = "Livros para ler",
        content: String = "Torto arado e A hora da estrela.",
        updatedAt: String = "2026-09-11T12:00:00Z",
        createdAt: String = updatedAt,
        revision: Int = 1,
        tags: List<String> = emptyList(),
        link: NoteLinkDto? = null,
    ) = NoteDto(
        id,
        name,
        type = "text",
        schemaVersion = 1,
        data = JsonObject(mapOf("body" to JsonPrimitive(content))),
        links = listOfNotNull(link),
        tags = tags,
        revision = revision,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

    @Test
    fun groupsByTheDayOfTheLastEdit() {
        val groups =
            groupNotes(
                listOf(
                    note(id = "a", updatedAt = "2026-09-14T11:05:00Z"),
                    note(id = "b", updatedAt = "2026-09-14T00:12:00Z"),
                    note(id = "c", updatedAt = "2026-09-11T12:00:00Z"),
                    note(id = "d", updatedAt = "2026-09-02T12:00:00Z"),
                    note(id = "e", updatedAt = "2026-08-20T12:00:00Z"),
                ),
                now,
            )

        assertEquals(
            listOf(
                "Hoje" to listOf("a"),
                "Ontem" to listOf("b"),
                "Esta semana" to listOf("c"),
                "Este mês" to listOf("d"),
                "agosto de 2026" to listOf("e"),
            ),
            groups.map { group -> group.label to group.notes.map { it.id } },
        )
    }

    @Test
    fun insideAGroupTheMostRecentComesFirst() {
        val group =
            groupNotes(
                listOf(note(id = "manha", updatedAt = "2026-09-14T09:45:00Z"), note(id = "tarde", updatedAt = "2026-09-14T12:40:00Z")),
                now,
            ).single()

        assertEquals(listOf("tarde", "manha"), group.notes.map { it.id })
    }

    @Test
    fun filtersByOriginAndSearchesIgnoringAccents() {
        val onEvent = note(id = "e", tags = listOf("saúde"), link = NoteLinkDto("event", "ev", "Academia"))
        val onTask = note(id = "t", name = "Ideias", link = NoteLinkDto("task", "ta", "Revisar proposta"))
        val loose = note(id = "l")
        val all = listOf(onEvent, onTask, loose)

        assertEquals(listOf("e"), filterNotes(all, NoteFilter.Events).map { it.id })
        assertEquals(listOf("t"), filterNotes(all, NoteFilter.Tasks).map { it.id })
        assertEquals(listOf("l"), filterNotes(all, NoteFilter.Loose).map { it.id })
        assertEquals(listOf("e"), filterNotes(all, NoteFilter.All, "SAUDE").map { it.id })
        assertEquals(listOf("t"), filterNotes(all, NoteFilter.All, "proposta").map { it.id })
        assertEquals(emptyList<String>(), filterNotes(all, NoteFilter.Tasks, "livros").map { it.id })
    }

    @Test
    fun listStampIsTimeTodayAndYesterdayAndShortDayAfter() {
        assertEquals("08:05", noteStamp("2026-09-14T11:05:00Z", now))
        assertEquals("21:12", noteStamp("2026-09-14T00:12:00Z", now))
        assertEquals("sex., 11 set.", noteStamp("2026-09-11T12:00:00Z", now))
        assertEquals("qua., 24 dez. 2025", noteStamp("2025-12-24T12:00:00Z", now))
    }

    @Test
    fun labelsWhenTheTargetHappens() {
        assertEquals("hoje, 09:00", whenLabel("2026-09-14T12:00:00Z", now))
        assertEquals("ontem, 09:00", whenLabel("2026-09-13T12:00:00Z", now))
        assertEquals("amanhã, 08:00", whenLabel("2026-09-15T11:00:00Z", now))
        assertEquals("2 set., 09:00", whenLabel("2026-09-02T12:00:00Z", now))
    }

    @Test
    fun datesLineShowsTheEditOnlyWhenThereWasOne() {
        assertEquals("Criada hoje, 08:05", noteDatesLine(note(createdAt = "2026-09-14T11:05:00Z", updatedAt = "2026-09-14T11:05:00Z"), now))
        assertEquals(
            "Criada em 12 set. · editada ontem, 21:12",
            noteDatesLine(note(createdAt = "2026-09-12T12:00:00Z", updatedAt = "2026-09-14T00:12:00Z", revision = 3), now),
        )
    }

    @Test
    fun originLabel() {
        assertEquals("Nota solta", noteOriginLabel(note()))
        assertEquals("Evento · Almoço", noteOriginLabel(note(link = NoteLinkDto("event", "e", "Almoço"))))
        assertEquals("Tarefa · Revisar proposta", noteOriginLabel(note(link = NoteLinkDto("task", "t", "Revisar proposta"))))
    }

    @Test
    fun snippetDropsTheRepeatedTitleMarkersAndLineBreaks() {
        assertEquals(
            "Arroz integral Frango Café Aveia",
            noteSnippet(note(name = "Lista do mercado", content = "Lista do mercado\n- Arroz integral\n- Frango\n\n## Café\nAveia")),
        )
        assertEquals("Primeira linha Segunda", noteSnippet(note(name = "Outro nome", content = "Primeira linha\nSegunda")))
    }

    @Test
    fun snippetDropsMarkdownMarkup() {
        assertEquals(
            "Importante: ver o plano e npm i citação tarefa passo código uma_variavel e velho novo",
            noteSnippet(
                note(
                    name = "Ideias",
                    content =
                        "Ideias\n**Importante**: ver [o plano](https://x.dev) e `npm i`\n> citação\n- [ ] tarefa\n1. passo\n---\n" +
                            "```\ncódigo\n```\numa_variavel e ~~velho~~ _novo_",
                ),
            ),
        )
    }

    @Test
    fun markdownBodyDropsTheRepeatedTitle() {
        assertEquals("Texto **forte**", noteMarkdownOf(note(name = "Ideias", content = "# Ideias\n\nTexto **forte**")))
        assertEquals("Primeira\nSegunda", noteMarkdownOf(note(name = "Outro", content = "Primeira\nSegunda")))
    }
}
