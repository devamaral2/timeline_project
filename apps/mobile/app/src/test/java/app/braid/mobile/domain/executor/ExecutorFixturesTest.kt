package app.braid.mobile.domain.executor

import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.artifactActor
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** Os modos de executor, a regra dos artefatos e a busca, conferidos contra `view-mode.ts`, `artifactActor` e a busca da agenda. */
class ExecutorFixturesTest {
    private val modes = Fixtures.json("executor-view-modes").jsonObject

    @Test
    fun `the three modes send the same actor to the API as the web`() {
        val expected = (modes.getValue("modes") as JsonArray).map { it.jsonObject }
        assertEquals(expected.map { it.getValue("id").jsonPrimitive.content }, ViewMode.entries.map { it.code })
        for (mode in expected) {
            val actor =
                mode
                    .getValue("actor")
                    .takeUnless { it is JsonNull }
                    ?.jsonPrimitive
                    ?.content
            val resolved = ViewMode.fromCode(mode.getValue("id").jsonPrimitive.content)
            assertEquals(actor, resolved.actor?.let { if (it == TaskActor.Agent) "agent" else "human" })
        }
    }

    @Test
    fun `a stored value that is not a mode falls back to the default, like the web`() {
        assertEquals(modes.getValue("defaultId").jsonPrimitive.content, ViewMode.Default.code)
        for (lookup in modes.getValue("lookups").jsonArray.map { it.jsonObject }) {
            val id =
                lookup
                    .getValue("id")
                    .takeUnless { it is JsonNull }
                    ?.jsonPrimitive
                    ?.content
            assertEquals("lookup $id", lookup.getValue("resolved").jsonPrimitive.content, ViewMode.fromCode(id).code)
        }
    }

    @Test
    fun `skill, agent and router documents belong to agents, the others to the person`() {
        val cases =
            Fixtures
                .json("executor-artifact-actor")
                .jsonObject
                .getValue("cases")
                .jsonArray
        assertEquals(
            ArtifactType.entries.map { it.code },
            cases.map {
                it.jsonObject
                    .getValue("type")
                    .jsonPrimitive.content
            },
        )
        for (case in cases.map { it.jsonObject }) {
            val type = ArtifactType.fromCode(case.getValue("type").jsonPrimitive.content)
            val expected = if (case.getValue("actor").jsonPrimitive.content == "agent") TaskActor.Agent else TaskActor.Human
            assertEquals(type.code, expected, artifactActor(type))
        }
    }
}
