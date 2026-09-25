package app.braid.mobile.data.dto

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Fixtures são geradas por `scripts/mobile/generate-fixtures.ts` e validadas
 * pelos schemas Zod em `packages/contracts/src/schemas.ts`.
 *
 * `ignoreUnknownKeys = false` é proposital: o servidor adicionando um campo
 * obrigatório sem atualizar o DTO Kotlin quebra esta suíte imediatamente.
 */
class ContractFixturesTest {
    private val json =
        Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }

    @Test
    fun contractFixturesRoundTripWithoutDroppingFields() {
        assertFixture("timeline-page", TimelineEventPageDto.serializer())
        assertFixture("event-detail", EventDetailDto.serializer())
        assertFixture("create-event-input", CreateEventInputDto.serializer())
        assertFixture("update-event-input", UpdateEventInputDto.serializer())
        assertFixture("agent-chat-ticket", AgentChatTicketDto.serializer())
        assertFixture("agent-conversations", AgentConversationPageDto.serializer())
        assertFixture("agent-messages", AgentChatMessagePageDto.serializer())
        assertFixture("tag-suggestions", ListSerializer(TagSuggestionDto.serializer()))
    }

    @Test
    fun everyClientAndServerFrameVariantIsCovered() {
        assertFixture("agent-client-frames", ListSerializer(AgentChatClientFrameDto.serializer()))
        assertFixture("agent-server-frames", ListSerializer(AgentChatServerFrameDto.serializer()))
    }

    private fun <T> assertFixture(
        name: String,
        serializer: KSerializer<T>,
    ) {
        val raw = javaClass.classLoader!!.getResource("fixtures/$name.json")!!.readText()
        val source = json.parseToJsonElement(raw)
        val decoded = json.decodeFromJsonElement(serializer, source)
        val reencoded = json.encodeToJsonElement(serializer, decoded)
        assertJsonEquivalent(source, reencoded, name)
    }

    private fun assertJsonEquivalent(
        expected: JsonElement,
        actual: JsonElement,
        path: String,
    ) {
        when {
            expected is JsonObject && actual is JsonObject -> {
                assertEquals("keys at $path", expected.keys, actual.keys)
                for (key in expected.keys) {
                    assertJsonEquivalent(expected.getValue(key), actual.getValue(key), "$path.$key")
                }
            }

            expected is JsonArray && actual is JsonArray -> {
                assertEquals("array size at $path", expected.size, actual.size)
                expected.indices.forEach { index -> assertJsonEquivalent(expected[index], actual[index], "$path[$index]") }
            }

            expected is JsonPrimitive && actual is JsonPrimitive && !expected.isString && !actual.isString -> {
                val expectedNumber = expected.content.toBigDecimalOrNull()
                val actualNumber = actual.content.toBigDecimalOrNull()
                if (expectedNumber != null && actualNumber != null) {
                    assertTrue(expectedNumber.compareTo(actualNumber) == 0)
                } else {
                    assertEquals("primitive at $path", expected, actual)
                }
            }

            else -> assertEquals("value at $path", expected, actual)
        }
    }
}
