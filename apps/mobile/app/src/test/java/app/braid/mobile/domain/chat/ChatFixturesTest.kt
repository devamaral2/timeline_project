package app.braid.mobile.domain.chat

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.requests.RequestDto
import app.braid.mobile.data.requests.toDomain
import app.braid.mobile.domain.agenda.FreeWindow
import app.braid.mobile.domain.markdown.MarkdownInline
import app.braid.mobile.domain.request.AgentRequest
import app.braid.mobile.domain.request.AgentTrace
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.TraceEntry
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** As funções portadas do chat contra o que as funções TS devolveram para as mesmas entradas. */
class ChatFixturesTest {
    private fun cases(function: String) = fixtureCases("chat-functions", function)

    @Test
    fun `answer choices are the quoted alternatives the web finds`() {
        for (case in cases("answerChoices")) assertEquals(case.toString(), case.resultStrings, answerChoices(case.string(0)))
    }

    @Test
    fun `the choice button label is the alternative with a capital first letter`() {
        for (case in cases("choiceLabel")) assertEquals(case.toString(), case.resultString, choiceLabel(case.string(0)))
    }

    @Test
    fun `an address is shortened as the web shortens it`() {
        for (case in cases("shortUrl")) assertEquals(case.toString(), case.resultString, shortUrl(case.string(0)))
    }

    @Test
    fun `the mode commands are read as the web reads them`() {
        for (case in cases("parseChatCommand")) {
            val expected = case.result
            val actual = parseChatCommand(case.string(0))
            if (expected is JsonNull) {
                assertNull(case.toString(), actual)
            } else if (expected.jsonObject
                    .getValue("kind")
                    .jsonPrimitive.content == "leave"
            ) {
                assertEquals(case.toString(), ChatModeCommand.Leave, actual)
            } else {
                val text = expected.jsonObject.getValue("text").let { if (it is JsonNull) null else it.jsonPrimitive.content }
                assertEquals(case.toString(), ChatModeCommand.Hermes(text), actual)
            }
        }
    }

    @Test
    fun `the slash bar matches the commands the web matches, minus the dead search command`() {
        for (case in cases("parseCommand")) {
            val expected = case.result
            val actual = parseCommand(case.string(0))
            val slugs =
                if (expected is JsonNull) {
                    emptyList()
                } else {
                    expected.jsonObject.getValue("slugs").jsonArray.map { it.jsonPrimitive.content }.filter {
                        it !=
                            "buscar"
                    }
                }
            if (slugs.isEmpty()) {
                assertNull(case.toString(), actual)
            } else {
                assertEquals(case.toString(), slugs, actual?.matches?.map { it.slug })
                assertEquals(
                    case.toString(),
                    expected.jsonObject
                        .getValue("argument")
                        .jsonPrimitive.content,
                    actual?.argument,
                )
            }
        }
    }

    @Test
    fun `a command without a screen yet is not a command and goes to the AI`() {
        assertNull(parseCommand("/tarefa comprar pão", available = listOf(ChatCommand.Settings)))
        assertEquals(listOf(ChatCommand.Settings), parseCommand("/conf", available = listOf(ChatCommand.Settings))?.matches)
    }

    /** O pedido como a API o entrega, com só o que o caso do fixture traz: o rastro ou as entidades. */
    private fun requestWith(
        trace: JsonElement? = null,
        entities: JsonArray = JsonArray(emptyList()),
    ): AgentRequest =
        BraidJson
            .decodeFromJsonElement(
                RequestDto.serializer(),
                buildJsonObject {
                    put("id", "r1")
                    put("kind", "request")
                    put("route", "steps")
                    put("status", "running")
                    put("title", "Pedido")
                    put("createdAt", "2026-09-14T14:48:00.000Z")
                    put("updatedAt", "2026-09-14T14:48:00.000Z")
                    put("entities", entities)
                    if (trace != null) put("trace", trace)
                },
            ).toDomain()

    private fun entriesOf(array: JsonArray): List<TraceEntry> = requestWith(trace = buildJsonObject { put("entries", array) }).entries

    @Test
    fun `the Hermes steps are the thoughts and tools of the trace, minus what has not started`() {
        for (case in cases("hermesStepsOf")) {
            val actual = hermesStepsOf(entriesOf(case.args[0].jsonArray))
            val expected = case.result.jsonArray.map { it.jsonObject }
            assertEquals(case.toString(), expected.map { it.string("id") }, actual.map { it.id })
            assertEquals(expected.map { it.string("kind") }, actual.map { it.kind.code })
            assertEquals(expected.map { it.string("label") }, actual.map { it.label })
            assertEquals(expected.map { it["detail"]?.jsonPrimitive?.content }, actual.map { it.detail })
            assertEquals(expected.map { it.string("status") }, actual.map { it.status.code })
        }
    }

    @Test
    fun `durations read as the web reads them`() {
        for (case in cases(
            "traceDuration",
        )) {
            assertEquals(case.toString(), case.resultString, traceDuration(case.args[0].jsonPrimitive.double))
        }
    }

    private fun traceOf(element: JsonElement): AgentTrace = requireNotNull(requestWith(trace = element).trace)

    @Test
    fun `the timeline puts each step where the web puts it`() {
        for (case in cases("timelineBars")) {
            val timeline = timelineBars(traceOf(case.args[0]), case.args[1].jsonPrimitive.long)
            val expected = case.result.jsonObject
            assertEquals(case.toString(), expected.getValue("totalMs").jsonPrimitive.double, timeline.totalMs, EPSILON)
            val bars = expected.getValue("bars").jsonArray.map { it.jsonObject }
            assertEquals(case.toString(), bars.map { it.string("id") }, timeline.bars.map { it.entry.id })
            assertEquals(bars.map { it.string("lane") }, timeline.bars.map { it.lane.code })
            bars.forEachIndexed { index, bar ->
                assertEquals(bar.getValue("left").jsonPrimitive.double, timeline.bars[index].left, EPSILON)
                assertEquals(bar.getValue("width").jsonPrimitive.double, timeline.bars[index].width, EPSILON)
            }
        }
    }

    private fun nodeOf(inline: MarkdownInline): JsonObject =
        buildJsonObject {
            when (inline) {
                is MarkdownInline.Text -> {
                    put("type", "text")
                    put("value", inline.text)
                }
                is MarkdownInline.Code -> {
                    put("type", "inlineCode")
                    put("value", inline.text)
                }
                is MarkdownInline.Strong -> {
                    put("type", "strong")
                    put("children", JsonArray(inline.content.map(::nodeOf)))
                }
                else -> error("O fixture só tem texto, código e negrito.")
            }
        }

    @Test
    fun `a paragraph is polished as remarkAnswer polishes it`() {
        for (case in cases("polishParagraph")) {
            val text = case.string(0)
            val nextIsList = case.args[1].jsonPrimitive.boolean
            val expected = case.result.jsonObject
            when (val actual = polishParagraph(listOf(MarkdownInline.Text(text)), nextIsList)) {
                is PolishedParagraph.Label -> {
                    assertEquals(case.toString(), true, expected.getValue("label").jsonPrimitive.boolean)
                    assertEquals(expected.getValue("children").jsonArray.map { it.jsonObject.string("value") }, listOf(actual.text))
                }
                is PolishedParagraph.Body -> {
                    assertEquals(case.toString(), false, expected.getValue("label").jsonPrimitive.boolean)
                    assertEquals(case.toString(), expected.getValue("choices").jsonArray.map { it.jsonPrimitive.content }, actual.choices)
                    assertEquals(case.toString(), expected.getValue("children"), JsonArray(actual.children.map(::nodeOf)))
                }
            }
        }
    }

    @Test
    fun `the request with a free window attached reads as the web writes it`() {
        for (case in cases("requestWithWindow")) {
            val window = case.args[0].jsonObject
            val attached =
                FreeWindow(
                    dayKey = window.string("dayKey"),
                    startMs = window.getValue("startMs").jsonPrimitive.long,
                    endMs = window.getValue("endMs").jsonPrimitive.long,
                    minutes = window.getValue("minutes").jsonPrimitive.int,
                    endsAtMidnight = window.getValue("endsAtMidnight").jsonPrimitive.boolean,
                )
            assertEquals(case.toString(), case.resultString, requestWithWindow(attached, case.string(1)))
        }
    }

    @Test
    fun `the entity rows say what the web says`() {
        for (case in cases("entityRows")) {
            val entity = requestWith(entities = JsonArray(listOf(case.args[0]))).entities.single()
            val expected = case.result.jsonObject
            assertEquals(expected.string("text"), chatEntityText(entity))
            assertEquals(expected.string("id"), entity.id)
            assertEquals(expected.string("label"), entity.name)
            assertEquals(expected.string("kind") == "task", entity.kind == EntityKind.Task)
            assertEquals(
                expected.string("change"),
                mapOf("create" to "created", "update" to "updated", "delete" to "deleted")[entity.operation.code],
            )
        }
    }

    @Test
    fun `each failure code has the text the web shows`() {
        for (case in cases(
            "failureText",
        )) {
            assertEquals(case.toString(), case.resultString, chatFailureText(ChatFailureCode.fromCode(case.string(0))))
        }
    }

    private fun JsonObject.string(name: String) = getValue(name).jsonPrimitive.content

    private companion object {
        const val EPSILON = 1e-9
    }
}
