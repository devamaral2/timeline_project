package app.braid.mobile.data.artifacts

import app.braid.mobile.domain.artifact.AgentFileData
import app.braid.mobile.domain.artifact.ArtifactFilters
import app.braid.mobile.domain.artifact.ArtifactNotFoundException
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.domain.artifact.FoodGeneration
import app.braid.mobile.domain.artifact.SleepData
import app.braid.mobile.domain.artifact.TextData
import app.braid.mobile.domain.artifact.TrainingData
import app.braid.mobile.domain.artifact.WorkoutCatalogData
import app.braid.mobile.domain.artifact.WorkoutCategory
import app.braid.mobile.domain.artifact.WorkoutSnapshot
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.fixture
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** O repositório de documentos contra a fronteira de rede: consulta, contratos de cada tipo e erros. */
class ArtifactRepositoryTest {
    private lateinit var backend: TestBackend
    private lateinit var repository: DefaultArtifactRepository

    @Before
    fun setUp() {
        backend = TestBackend()
        repository = DefaultArtifactRepository(TestGraph(backend).apis.create(ArtifactsApi::class.java))
    }

    @After
    fun tearDown() = backend.close()

    @Test
    fun `an unfiltered list sends no query at all and reads every type`() =
        runTest {
            backend.route("GET", "/api/artifacts", fixture("documents-list"))

            val artifacts = repository.list()

            val request = backend.requestsTo("GET", "/api/artifacts").single()
            assertNull(request.requestUrl!!.query)
            assertEquals(ArtifactType.entries.toList(), artifacts.map { it.type })
        }

    @Test
    fun `type, tag, text and the global scope go to the API as the web sends them`() =
        runTest {
            backend.route("GET", "/api/artifacts", fixture("documents-global-foods"))

            val artifacts = repository.list(ArtifactFilters(type = ArtifactType.Food, global = true, tag = "casa", query = "  banana "))

            val url = backend.requestsTo("GET", "/api/artifacts").single().requestUrl!!
            assertEquals("food", url.queryParameter("type"))
            assertEquals("global", url.queryParameter("scope"))
            assertEquals("casa", url.queryParameter("tag"))
            assertEquals("banana", url.queryParameter("q"))
            assertTrue(artifacts.single().global)
        }

    @Test
    fun `a blank text is not sent`() =
        runTest {
            backend.route("GET", "/api/artifacts", fixture("documents-list-empty"))

            assertTrue(repository.list(ArtifactFilters(query = "   ")).isEmpty())

            assertNull(
                backend
                    .requestsTo("GET", "/api/artifacts")
                    .single()
                    .requestUrl!!
                    .query,
            )
        }

    @Test
    fun `a text document keeps its body, tags and linked tasks`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-text", fixture("documents-detail-text"))

            val artifact = repository.get("doc-text")

            assertEquals("Ideias para o projeto", artifact.name)
            assertEquals(listOf("trabalho", "ideias"), artifact.tags)
            assertFalse(artifact.global)
            assertTrue((artifact.data as TextData).body.startsWith("# Ideias para o projeto"))
            assertEquals(listOf("creates", "uses"), artifact.tasks.map { it.relation })
            assertEquals(TaskKind.SearchRequest, artifact.tasks[1].kind)
            assertNotNull(artifact.tasks[0].startedAt)
        }

    @Test
    fun `a food document keeps totals, items and the recipe, and one being calculated says so`() =
        runTest {
            backend.route("GET", "/api/artifacts/doc-food", fixture("documents-detail-food"))
            backend.route("GET", "/api/artifacts/doc-food-pending", fixture("documents-detail-food-pending"))

            val food = repository.get("doc-food").data as FoodData
            val pending = repository.get("doc-food-pending").data as FoodData

            assertEquals(612.5, food.totals.calories, 0.0)
            assertEquals(listOf("Arroz", "Frango grelhado"), food.items.map { it.name })
            assertTrue(food.recipe!!.suggested)
            assertEquals(3, food.recipe!!.steps.size)
            assertTrue(food.modelEstimate)
            assertNull(food.generation)
            assertEquals(FoodGeneration.Pending, pending.generation)
            assertTrue(pending.items.isEmpty())
        }

    @Test
    fun `training, sleep, exercise and agent file documents decode`() =
        runTest {
            backend.route("GET", "/api/artifacts", fixture("documents-list"))

            val byType = repository.list().associateBy { it.type }

            val training = byType.getValue(ArtifactType.Training).data as TrainingData
            assertEquals(640.0, training.caloriesBurned, 0.0)
            assertTrue(training.workouts[0] is WorkoutSnapshot.Cardio)
            assertEquals(3, (training.workouts[1] as WorkoutSnapshot.Weightlifting).sets.size)
            assertTrue(training.workouts[2] is WorkoutSnapshot.Free)
            assertEquals(450.0, (byType.getValue(ArtifactType.Sleep).data as SleepData).trackedSleepTime, 0.0)
            val workout = byType.getValue(ArtifactType.Workout)
            assertTrue(workout.global)
            assertEquals(WorkoutCategory.Cardio, (workout.data as WorkoutCatalogData).category)
            assertEquals("hermes/skills/pesquisar/SKILL.md", (byType.getValue(ArtifactType.Skill).data as AgentFileData).path)
        }

    @Test
    fun `a document that does not exist, or belongs to someone else, is not found`() =
        runTest {
            backend.route("GET", "/api/artifacts/gone", status(404))
            backend.route("GET", "/api/artifacts/theirs", status(403))
            backend.route("GET", "/api/artifacts/broken", status(500))

            for (id in listOf("gone", "theirs")) {
                try {
                    repository.get(id)
                    fail("$id should not be found")
                } catch (expected: ArtifactNotFoundException) {
                    assertEquals("Documento não encontrado.", expected.message)
                }
            }
            try {
                repository.get("broken")
                fail("a server error is not a missing document")
            } catch (expected: retrofit2.HttpException) {
                assertEquals(500, expected.code())
            }
        }
}
