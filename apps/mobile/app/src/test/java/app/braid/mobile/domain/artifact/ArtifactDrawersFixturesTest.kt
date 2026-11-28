package app.braid.mobile.domain.artifact

import app.braid.mobile.data.artifacts.ArtifactDto
import app.braid.mobile.data.artifacts.toDomain
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** As gavetas por tipo e a linha de cada uma, conferidas contra as saídas das funções do web (`documents-drawers.json`). */
class ArtifactDrawersFixturesTest {
    private val fixture = Fixtures.json("documents-drawers").jsonObject
    private val now = Instant.parse(fixture.text("now"))
    private val json = Json { ignoreUnknownKeys = true }

    private val artifacts: List<Artifact> =
        cases("artifacts").map { json.decodeFromJsonElement(ArtifactDto.serializer(), it).toDomain() }

    private fun cases(name: String): List<JsonObject> = fixture.getValue(name).jsonArray.map { it.jsonObject }

    private fun JsonObject.text(name: String): String = getValue(name).jsonPrimitive.content

    private fun JsonObject.textOrNull(name: String): String? = get(name)?.takeIf { it != JsonNull }?.jsonPrimitive?.content

    /** No web a gaveta dos tipos desconhecidos é `other`; aqui é a do tipo [ArtifactType.Unknown]. */
    private fun typeOf(key: String): ArtifactType = if (key == "other") ArtifactType.Unknown else ArtifactType.fromCode(key)

    @Test
    fun `the drawers keep the web order, title and rows`() {
        val expected =
            cases("drawers").map { drawer ->
                Triple(typeOf(drawer.text("key")), drawer.text("title"), drawer.getValue("ids").jsonArray.map { it.jsonPrimitive.content })
            }

        assertEquals(
            expected,
            artifactDrawersOf(artifacts).map { drawer -> Triple(drawer.type, drawer.title, drawer.artifacts.map { it.id }) },
        )
    }

    @Test
    fun `each row says what the web row says`() {
        val rows = cases("rows")
        assertEquals(rows.size, artifacts.size)
        rows.zip(artifacts).forEach { (row, artifact) ->
            val expected = row.getValue("facts").jsonObject
            val facts = artifactRowFacts(artifact, now)
            val support =
                expected
                    .getValue("support")
                    .jsonArray
                    .map { it.jsonObject }
                    .map { it.text("text") to it.textOrNull("style") }
            assertEquals("support of ${artifact.id}", support, facts.support.map { it.text to it.style?.code })
            assertEquals("tags of ${artifact.id}", expected.getValue("tags").jsonArray.map { it.jsonPrimitive.content }, facts.tags)
            assertEquals("figure of ${artifact.id}", expected.textOrNull("figure"), facts.figure)
            assertEquals("status of ${artifact.id}", expected.textOrNull("agentStatus"), facts.agentStatus?.code)
        }
    }

    @Test
    fun `only the text drawer starts open, unless the list is narrowed or has a single drawer`() {
        for (case in cases("startsOpen")) {
            val result =
                artifactDrawerStartsOpen(
                    typeOf(case.text("key")),
                    case.getValue("drawerCount").jsonPrimitive.int,
                    case.getValue("narrowed").jsonPrimitive.boolean,
                )
            assertEquals(case.toString(), case.getValue("result").jsonPrimitive.boolean, result)
        }
    }
}
