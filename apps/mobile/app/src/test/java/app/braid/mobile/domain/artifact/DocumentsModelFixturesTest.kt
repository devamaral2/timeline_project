package app.braid.mobile.domain.artifact

import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/** As regras de texto dos documentos, conferidas contra as saídas das funções do web (`documents-model.json`). */
class DocumentsModelFixturesTest {
    private val model = Fixtures.json("documents-model").jsonObject
    private val now = Instant.parse(model.getValue("now").jsonPrimitive.content)

    private fun cases(name: String): List<JsonObject> = model.getValue(name).jsonArray.map { it.jsonObject }

    private fun JsonElement.text(): String = jsonPrimitive.content

    private fun JsonObject.number(name: String): Double = getValue(name).jsonPrimitive.doubleOrNull!!

    @Test
    fun `the types keep the web order, label and visual type`() {
        assertEquals(model.getValue("typeOrder").jsonArray.map { it.text() }, ArtifactType.entries.map { it.code })
        for (case in cases("labels")) {
            val type = ArtifactType.fromCode(case.getValue("type").text())
            assertEquals(case.getValue("label").text(), artifactTypeLabel(type))
            assertEquals(case.getValue("visual").text(), artifactVisualType(type))
        }
    }

    @Test
    fun `the list caption counts like the web`() {
        for (case in cases("counts")) {
            assertEquals(case.getValue("label").text(), artifactCountLabel(case.getValue("count").text().toInt()))
        }
    }

    @Test
    fun `when labels say today, yesterday, tomorrow or the short date`() {
        for (case in cases("whenLabels")) {
            assertEquals(case.getValue("label").text(), whenLabel(Instant.parse(case.getValue("instant").text()), now))
        }
    }

    @Test
    fun `the repeated title leaves the markdown body`() {
        for (case in cases("markdown")) {
            val artifact = artifact(case.getValue("name").text(), TextData(case.getValue("body").text()))
            assertEquals("body: ${case.getValue("body").text()}", case.getValue("result").text(), markdownBodyOf(artifact))
        }
    }

    @Test
    fun `only text and router have a markdown body`() {
        val food = artifact("Almoço", SleepData(450.0, 87.0), ArtifactType.Sleep)
        assertEquals("", markdownBodyOf(food))
        assertEquals("Roteia", markdownBodyOf(artifact("R", TextData("Roteia"), ArtifactType.Router)))
    }

    @Test
    fun `a sleep document lives on the night of its task`() {
        for (case in cases("sleepAgenda")) {
            val links =
                case.getValue("tasks").jsonArray.map {
                    val task = it.jsonObject
                    ArtifactTaskLink(
                        taskId = task.getValue("taskId").text(),
                        relation = task.getValue("relation").text(),
                        name = task.getValue("name").text(),
                        actor = TaskActor.Human,
                        kind = TaskKind.fromCode(task.getValue("kind").text()),
                        startedAt = task["startedAt"]?.text()?.let(Instant::parse),
                        estimatedFinishAt = task["estimatedFinishAt"]?.text()?.let(Instant::parse),
                    )
                }
            val expected = case.getValue("result")
            val actual = sleepAgendaOfArtifact(links)
            if (expected is JsonNull) {
                assertNull(actual)
            } else {
                assertEquals(expected.jsonObject.getValue("title").text(), actual?.title)
                val minutes = expected.jsonObject.getValue("agendaMinutes")
                assertEquals(if (minutes is JsonNull) null else minutes.text().toInt(), actual?.agendaMinutes)
            }
        }
    }

    @Test
    fun `date lines and minutes between match the web`() {
        for (case in cases("dateLines")) {
            val finish =
                case
                    .getValue("finishedAt")
                    .takeUnless { it is JsonNull }
                    ?.text()
                    ?.let(Instant::parse)
            assertEquals(case.getValue("result").text(), dateLineOf(Instant.parse(case.getValue("startedAt").text()), finish))
        }
        for (case in cases("minutesBetween")) {
            val minutes = minutesBetween(Instant.parse(case.getValue("from").text()), Instant.parse(case.getValue("to").text()))
            assertEquals(case.getValue("result").text().toInt(), minutes)
        }
    }

    @Test
    fun `decimals, durations and paces are written like the web`() {
        for (case in cases(
            "decimals",
        )) {
            assertEquals("${case.number("value")}", case.getValue("result").text(), formatDecimal(case.number("value")))
        }
        for (case in cases(
            "minutes",
        )) {
            assertEquals("${case.number("value")}", case.getValue("result").text(), formatMinutes(case.number("value")))
        }
        for (case in cases(
            "paces",
        )) {
            assertEquals("${case.number("value")}", case.getValue("result").text(), formatPace(case.number("value")))
        }
        for (case in cases("plurals")) {
            assertEquals(case.getValue("result").text(), pluralize(case.getValue("count").text().toInt(), "série", "séries"))
        }
    }

    @Test
    fun `macro shares weigh the calories like the web`() {
        for (case in cases("macros")) {
            val totals =
                FoodTotals(0.0, case.number("totalProteinGrams"), case.number("totalCarbohydrateGrams"), case.number("totalFatGrams"))
            val expected = case.getValue("result").jsonArray.map { it.text().toInt() }
            assertEquals(expected, macroShares(totals).toList())
        }
    }

    @Test
    fun `sets group by exercise in the order they appear`() {
        for (case in cases("setGroups")) {
            val sets =
                case.getValue("sets").jsonArray.map {
                    val set = it.jsonObject
                    WorkoutSet(
                        set.getValue("id").text(),
                        set.getValue("exercise").text(),
                        set.getValue("repetitions").text().toInt(),
                        set.number("weight"),
                    )
                }
            val expected =
                case.getValue("result").jsonArray.map {
                    it.jsonObject.getValue("exercise").text() to
                        it.jsonObject
                            .getValue("setIds")
                            .jsonArray
                            .map { id -> id.text() }
                }
            assertEquals(expected, groupSetsByExercise(sets).map { group -> group.exercise to group.sets.map { it.id } })
        }
    }

    private fun artifact(
        name: String,
        data: ArtifactData,
        type: ArtifactType = ArtifactType.Text,
    ) = Artifact(
        id = "doc",
        name = name,
        type = type,
        data = data,
        global = false,
        tags = emptyList(),
        revision = 1,
        createdAt = now,
        updatedAt = now,
    )
}
