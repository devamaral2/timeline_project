package app.braid.mobile.data.tasks

import app.braid.mobile.domain.task.StaleRevisionException
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.statusPatch
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestGraph
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.time.Instant

/**
 * A troca de status na fronteira de rede, para os caminhos que a agenda não alcança: sair de `done` (a agenda só abre o
 * seletor na tarefa de referência), que o web e a lista de tarefas fazem.
 */
class TaskStatusRepositoryTest {
    private val change = Fixtures.json("tasks-status-change").jsonObject
    private val now = Instant.parse(change.getValue("now").jsonPrimitive.content)
    private lateinit var backend: TestBackend
    private lateinit var repository: DefaultTaskRepository

    @Before
    fun setUp() {
        backend = TestBackend()
        repository = DefaultTaskRepository(TestGraph(backend).apis.create(TasksApi::class.java))
    }

    @After
    fun tearDown() = backend.close()

    private fun card(status: TaskStatus?) =
        TaskCard(
            id = "task-2",
            actor = TaskActor.Human,
            kind = TaskKind.Common,
            status = status,
            name = "Almoço",
            startedAt = null,
            estimatedFinishAt = null,
            longRunning = false,
            tags = emptyList(),
            revision = 4,
        )

    @Test
    fun `leaving done sends a null finishedAt, as the web does`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-2", MockResponse().setResponseCode(204))
            val expected =
                (change.getValue("patches") as JsonArray)
                    .map { it.jsonObject }
                    .first { it.getValue("from").jsonPrimitive.content == "done" && it.getValue("to").jsonPrimitive.content == "doing" }
                    .getValue("patch")
                    .jsonObject
            assertEquals(JsonNull, expected["finishedAt"])

            repository.changeStatus("task-2", statusPatch(card(TaskStatus.Done), TaskStatus.Doing, now))

            val request = backend.requestsTo("PATCH", "/api/tasks/task-2").single()
            assertEquals(expected, Json.parseToJsonElement(request.body.readUtf8()))
        }

    @Test
    fun `a status that keeps the completion leaves finishedAt out of the body`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-2", MockResponse().setResponseCode(204))

            repository.changeStatus("task-2", statusPatch(card(TaskStatus.Todo), TaskStatus.Doing, now))

            val body =
                backend
                    .requestsTo("PATCH", "/api/tasks/task-2")
                    .single()
                    .body
                    .readUtf8()
            assertEquals("""{"expectedRevision":4,"status":"doing"}""", body)
        }

    @Test
    fun `a 409 is a stale revision`() =
        runTest {
            backend.route("PATCH", "/api/tasks/task-2", MockResponse().setResponseCode(409).setBody("{}"))

            try {
                repository.changeStatus("task-2", statusPatch(card(TaskStatus.Todo), TaskStatus.Doing, now))
                fail("expected a StaleRevisionException")
            } catch (expected: StaleRevisionException) {
                // é o que se espera
            }
        }
}
