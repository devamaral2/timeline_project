package app.braid.mobile.domain.markdown

import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** `summaryCardsOf` contra o que a função TS do web devolveu para os mesmos textos, campo a campo. */
class SummaryCardsFixturesTest {
    @Test
    fun `a text is read into cards as the web reads it`() {
        val cases = fixtureCases("summary-cards", "summaryCardsOf")
        for (case in cases) {
            val type = ArtifactType.entries.first { it.code == case.string(0) }
            val actual = summaryCardsOf(type, case.string(1))
            assertEquals(case.string(1), case.result, actual?.let(::json) ?: JsonNull)
        }
    }

    @Test
    fun `an artifact is read into cards or left as markdown as the web decides`() {
        val cases = fixtureCases("summary-cards", "summaryCardsTypeOf")
        for (case in cases) {
            val type = ArtifactType.entries.first { it.code == case.string(0) }
            val expected = (case.result as? JsonPrimitive)?.takeUnless { it is JsonNull }?.content
            assertEquals(case.toString(), expected, summaryCardsTypeOf(type, case.string(1))?.code)
        }
    }

    @Test
    fun `the transcript a daily reading keeps is read into the same cards as the transcript type`() {
        val text = fixtureCases("summary-cards", "summaryCardsOf").first { it.string(0) == "youtube_transcript" }.string(1)
        assertEquals(summaryCardsOf(ArtifactType.YoutubeTranscript, text), summaryCardsFor(ArtifactType.Text, text))
        assertNull(summaryCardsFor(ArtifactType.Text, "## Compras\n- pão"))
    }

    @Test
    fun `a type without cards is never read into them`() {
        assertNull(summaryCardsOf(ArtifactType.Text, "## Grupo\n### Ficha\nTexto."))
        assertNull(summaryCardsOf(ArtifactType.Router, "## Grupo\n- linha"))
    }

    private fun text(value: String?): JsonElement = value?.let(::JsonPrimitive) ?: JsonNull

    private fun list(items: List<JsonElement>): JsonElement = JsonArray(items)

    private fun json(document: SummaryDocument): JsonElement =
        buildJsonObject {
            put(
                "source",
                document.source?.let {
                    buildJsonObject {
                        put("label", it.label)
                        put("href", it.href)
                        put("byline", text(it.byline))
                    }
                } ?: JsonNull,
            )
            put("lead", document.lead)
            put(
                "score",
                list(
                    document.score.map {
                        buildJsonObject {
                            put("value", it.value)
                            put("label", it.label)
                        }
                    },
                ),
            )
            put("durationSeconds", document.durationSeconds?.let(::JsonPrimitive) ?: JsonNull)
            put("sections", list(document.sections.map(::json)))
        }

    private fun json(section: SummarySection): JsonElement =
        buildJsonObject {
            when (section) {
                is SummarySection.Cards -> {
                    put("kind", "cards")
                    put("title", text(section.title))
                    put("intro", section.intro)
                    put("cards", list(section.cards.map(::json)))
                }
                is SummarySection.Rows -> {
                    put("kind", "rows")
                    put("title", section.title)
                    put("rows", list(section.rows.map(::json)))
                    put("peaks", section.peaks)
                }
                is SummarySection.Text -> {
                    put("kind", "text")
                    put("title", section.title)
                    put("body", section.body)
                }
                is SummarySection.Transcript -> {
                    put("kind", "transcript")
                    put("title", section.title)
                    put("body", section.body)
                }
            }
        }

    private fun json(card: SummaryCard): JsonElement =
        buildJsonObject {
            put("title", card.title)
            put("kicker", text(card.kicker))
            put(
                "from",
                card.from?.let {
                    buildJsonObject {
                        put("name", it.name)
                        put("detail", text(it.detail))
                        put("initials", it.initials)
                    }
                } ?: JsonNull,
            )
            put(
                "due",
                card.due?.let {
                    buildJsonObject {
                        put("text", it.text)
                        put("tone", it.tone.code)
                    }
                } ?: JsonNull,
            )
            put(
                "sources",
                list(
                    card.sources.map {
                        buildJsonObject {
                            put("label", it.label)
                            put("href", text(it.href))
                        }
                    },
                ),
            )
            put(
                "actions",
                list(
                    card.actions.map {
                        buildJsonObject {
                            put("label", it.label)
                            put("href", it.href)
                        }
                    },
                ),
            )
            put("body", card.body)
        }

    private fun json(row: SummaryRow): JsonElement =
        buildJsonObject {
            put("title", text(row.title))
            put("text", row.text)
            put("time", text(row.time))
            put("href", text(row.href))
            put(
                "range",
                row.range?.let {
                    buildJsonObject {
                        put("start", it.start)
                        put("end", it.end)
                    }
                } ?: JsonNull,
            )
        }
}
