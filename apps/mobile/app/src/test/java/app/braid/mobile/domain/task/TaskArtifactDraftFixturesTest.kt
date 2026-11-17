package app.braid.mobile.domain.task

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.artifacts.ArtifactDto
import app.braid.mobile.data.artifacts.toDomain
import app.braid.mobile.data.tasks.toBody
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TaskEditFixtures
import app.braid.mobile.support.TaskEditFixtures.cases
import app.braid.mobile.support.TaskEditFixtures.draft
import app.braid.mobile.support.TaskEditFixtures.draftArtifact
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/** A lista de documentos da tarefa, conferida contra as funções do web (`task-artifact-draft.ts`, `task-draft.ts`, `mealCaloriesKcal`). */
class TaskArtifactDraftFixturesTest {
    private fun name(case: JsonObject) = case.getValue("name").jsonPrimitive.content

    private fun list(
        case: JsonObject,
        key: String = "list",
    ) = case.getValue(key).jsonArray.map { draftArtifact(it) }

    private fun artifact(case: JsonObject) = BraidJson.decodeFromJsonElement(ArtifactDto.serializer(), case.getValue("artifact")).toDomain()

    private fun linksJson(links: List<ArtifactLink>): JsonElement =
        TaskPatch(expectedRevision = 1, artifacts = links).toBody().getValue("artifacts")

    @Test
    fun `the drafts a task opens with are the ones the web builds`() {
        for (case in cases("task-artifacts-drafts")) {
            val key = case.getValue("key").jsonPrimitive.content
            val task = TaskEditFixtures.detail(case.getValue("task"))
            assertEquals(key, list(case, "draft"), draftArtifactsFromTask(task.artifacts))
            assertEquals(key, list(case, "draft"), draftFromTask(task).artifacts)
        }
    }

    @Test
    fun `every edit of the list gives the web's list, positions and links`() {
        for (case in cases("task-artifacts-operations")) {
            val before = list(case)
            val result =
                when (case.getValue("op").jsonPrimitive.content) {
                    "add" -> addDraftArtifact(before, artifact(case))
                    "copy" -> addFoodCopy(before, artifact(case), case.getValue("key").jsonPrimitive.content)
                    "quantity" ->
                        setCopyQuantity(before, case.getValue("id").jsonPrimitive.content, case.getValue("quantity").jsonPrimitive.content)
                    "remove" -> removeDraftArtifact(before, case.getValue("id").jsonPrimitive.content)
                    "move" ->
                        moveDraftArtifact(
                            before,
                            case.getValue("id").jsonPrimitive.content,
                            case
                                .getValue("step")
                                .jsonPrimitive.content
                                .toInt(),
                        )
                    else -> error("operação desconhecida")
                }
            assertEquals(name(case), list(case, "result"), result)
            assertEquals(
                name(case),
                case.getValue("positions").jsonArray.map {
                    it
                        .takeUnless { p ->
                            p is JsonNull
                        }?.jsonPrimitive
                        ?.content
                        ?.toInt()
                },
                draftArtifactPositions(result),
            )
            assertEquals(name(case), case.getValue("links"), linksJson(artifactLinkInputs(result)))
            assertEquals(name(case), case.getValue("same").jsonPrimitive.boolean, sameArtifactLinks(before, result))
        }
    }

    @Test
    fun `the patch carries the whole list only when it changed, as the web builds it`() {
        for (case in cases("task-artifacts-patch-cases")) {
            val now = Instant.parse(case.getValue("now").jsonPrimitive.content)
            val patch = buildTaskPatch(TaskEditFixtures.detail(case.getValue("task")), draft(case.getValue("draft")), now)
            val expected = case.getValue("patch")
            if (expected is JsonNull) assertNull(name(case), patch) else assertEquals(name(case), expected.jsonObject, patch?.toBody())
        }
    }

    @Test
    fun `the meal total sums the foods, copies included`() {
        for (case in cases("task-artifacts-calories")) {
            val task = TaskEditFixtures.detail(case.getValue("task"))
            assertEquals(task.card.name, case.getValue("kcal").jsonPrimitive.double, mealCaloriesKcal(task.artifacts), 0.0001)
        }
    }

    @Test
    fun `a rebase keeps the list the person edited and takes the new one otherwise`() {
        val previous = TaskEditFixtures.detail(Fixtures.json("task-artifacts-tasks").jsonObject.getValue("common"))
        val next = previous.copy(artifacts = emptyList())
        val untouched = draftFromTask(previous)
        val edited = untouched.copy(artifacts = untouched.artifacts.drop(1))
        assertEquals(emptyList<DraftArtifact>(), rebaseDraft(untouched, previous, next).artifacts)
        assertEquals(edited.artifacts, rebaseDraft(edited, previous, next).artifacts)
    }
}
