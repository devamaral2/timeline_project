package app.braid.mobile.ui.taskedit

import androidx.lifecycle.SavedStateHandle
import app.braid.mobile.data.tasks.DefaultRecurrenceRepository
import app.braid.mobile.data.tasks.DefaultTaskDetailRepository
import app.braid.mobile.data.tasks.DefaultTaskEditRepository
import app.braid.mobile.data.tasks.RecurrenceApi
import app.braid.mobile.data.tasks.TaskDetailApi
import app.braid.mobile.data.tasks.TaskEditApi
import app.braid.mobile.domain.task.RecurrenceField
import app.braid.mobile.domain.task.RecurrenceFrequency
import app.braid.mobile.domain.task.START_DATE_MESSAGE
import app.braid.mobile.domain.task.START_TIME_MESSAGE
import app.braid.mobile.domain.time.AppClock
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.TaskEditFixtures
import app.braid.mobile.support.TestBackend
import app.braid.mobile.support.TestBackend.Companion.status
import app.braid.mobile.support.TestGraph
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant
import java.util.TimeZone

/** A recorrência no formulário de tarefa, pela rede: o que cada caminho de gravação manda e em que ordem. */
@OptIn(ExperimentalCoroutinesApi::class)
class TaskEditRecurrenceViewModelTest {
    private val now = Instant.parse("2026-09-14T15:30:45.123Z")
    private val seriesPath = "/api/recurrences/rec-1"
    private lateinit var zone: TimeZone
    private lateinit var backend: TestBackend
    private lateinit var graph: TestGraph

    @Before
    fun setUp() {
        zone = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone("America/Sao_Paulo"))
        Dispatchers.setMain(UnconfinedTestDispatcher())
        backend = TestBackend()
        graph = TestGraph(backend)
    }

    @After
    fun tearDown() {
        Thread.sleep(100)
        backend.close()
        Dispatchers.resetMain()
        TimeZone.setDefault(zone)
    }

    private fun newViewModel(taskId: String? = null): TaskEditViewModel =
        TaskEditViewModel(
            SavedStateHandle(if (taskId == null) emptyMap() else mapOf("taskId" to taskId)),
            DefaultTaskDetailRepository(graph.apis.create(TaskDetailApi::class.java)),
            DefaultTaskEditRepository(graph.apis.create(TaskEditApi::class.java), graph.apis.create(TaskDetailApi::class.java)),
            DefaultRecurrenceRepository(graph.apis.create(RecurrenceApi::class.java)),
            AppClock { now },
        )

    private suspend fun TaskEditViewModel.await(condition: (TaskEditUiState.Form) -> Boolean): TaskEditUiState.Form =
        state.first { it is TaskEditUiState.Form && condition(it) } as TaskEditUiState.Form

    private val TaskEditViewModel.current: TaskEditUiState.Form get() = state.value as TaskEditUiState.Form

    private fun json(
        element: JsonElement,
        code: Int = 200,
    ): MockResponse = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(element.toString())

    private fun noContent() = MockResponse().setResponseCode(204)

    private fun serveTask(
        key: String,
        path: String,
    ) = backend.route("GET", path, json(Fixtures.json("task-edit-tasks").jsonObject.getValue(key)))

    private fun serveSeries(vararg versions: JsonElement) = backend.route("GET", seriesPath, *versions.map { json(it) }.toTypedArray())

    private val weekly get() = Fixtures.json("recurrence-series").jsonObject.getValue("weekly")

    private fun body(request: RecordedRequest): JsonObject = Json.parseToJsonElement(request.body.clone().readUtf8()).jsonObject

    private fun createCase(name: String): JsonObject =
        TaskEditFixtures.cases("recurrence-create-cases").first { it.getValue("name").jsonPrimitive.content == name }

    private fun TaskEditViewModel.fillFrom(case: JsonObject) {
        val form = TaskEditFixtures.draft(case.getValue("form"))
        update { form }
        defineRecurrence()
        val rule = case.getValue("draft").jsonObject
        changeRecurrence {
            it.copy(
                frequency = RecurrenceFrequency.fromCode(rule.getValue("frequency").jsonPrimitive.content),
                interval =
                    rule
                        .getValue("interval")
                        .jsonPrimitive.content
                        .toInt(),
                weekdays =
                    rule
                        .getValue("weekdays")
                        .jsonPrimitive.content
                        .toInt(),
                endsOn = rule.getValue("endsOn").jsonPrimitive.content,
            )
        }
    }

    @Test
    fun `creating with a rule creates the series instead of the task, with a stable key`() =
        runTest {
            backend.route("POST", "/api/recurrences", json(Fixtures.json("recurrence-created"), 201))
            val viewModel = newViewModel()
            val case = createCase("weekly with end and duration")
            viewModel.fillFrom(case)

            viewModel.save()
            val done = viewModel.await { it.done }

            assertFalse(done.saving)
            assertEquals(0, backend.requestsTo("POST", "/api/tasks").size)
            val request = backend.requestsTo("POST", "/api/recurrences").single()
            assertEquals(case.getValue("input").jsonObject, body(request))
            assertTrue(request.getHeader("Idempotency-Key").orEmpty().isNotEmpty())
        }

    @Test
    fun `the series carries the tags, reminders and kind of the form`() =
        runTest {
            backend.route("POST", "/api/recurrences", json(Fixtures.json("recurrence-created"), 201))
            val viewModel = newViewModel()
            val case = createCase("weekly every two weeks with tags and reminders")
            viewModel.fillFrom(case)

            viewModel.save()
            viewModel.await { it.done }

            assertEquals(case.getValue("input").jsonObject, body(backend.requestsTo("POST", "/api/recurrences").single()))
        }

    @Test
    fun `a series without start date and time is refused on the screen`() =
        runTest {
            val viewModel = newViewModel()
            viewModel.update { it.copy(name = "Treino") }
            viewModel.defineRecurrence()

            viewModel.save()

            val form = viewModel.current
            assertEquals(START_DATE_MESSAGE, form.recurrence.errors[RecurrenceField.StartDate])
            assertEquals(START_TIME_MESSAGE, form.recurrence.errors[RecurrenceField.StartTime])
            assertEquals(0, backend.requests.size)
        }

    @Test
    fun `a rule the API refuses shows the general message and keeps the form`() =
        runTest {
            backend.route("POST", "/api/recurrences", status(422))
            val viewModel = newViewModel()
            viewModel.fillFrom(createCase("monthly"))
            viewModel.changeRecurrence { it.copy(frequency = RecurrenceFrequency.Monthly) }

            viewModel.save()

            val form = viewModel.await { it.failure != null }
            assertEquals(REFUSED_FORM_NOTICE, form.failure)
            assertFalse(form.done)
            assertNotNull(form.recurrence.draft)
        }

    @Test
    fun `saving again after a failure reuses the key`() =
        runTest {
            backend.route("POST", "/api/recurrences", status(500), json(Fixtures.json("recurrence-created"), 201))
            val viewModel = newViewModel()
            viewModel.fillFrom(createCase("weekly with end and duration"))

            viewModel.save()
            viewModel.await { it.failure != null }
            viewModel.save()
            viewModel.await { it.done }
            val keys = backend.requestsTo("POST", "/api/recurrences").map { it.getHeader("Idempotency-Key") }
            assertEquals(2, keys.size)
            assertEquals(keys[0], keys[1])
        }

    @Test
    fun `a standalone task that gains a rule creates the series from the next day, before touching the task`() =
        runTest {
            serveTask("full", "/api/tasks/task-1")
            backend.route("POST", "/api/recurrences", json(Fixtures.json("recurrence-created"), 201))
            backend.route("PATCH", "/api/tasks/task-1", noContent())
            val viewModel = newViewModel("task-1")
            viewModel.await { true }
            viewModel.update { it.copy(name = "Reunião renomeada") }
            viewModel.defineRecurrence()

            viewModel.save()
            viewModel.await { it.done }

            // A tarefa começa segunda 14 set às 18:30 e dura 50 minutos; a série começa na terça, com a mesma hora e duração.
            val series = body(backend.requestsTo("POST", "/api/recurrences").single())
            assertEquals("weekly", series.getValue("frequency").jsonPrimitive.content)
            assertEquals("2026-09-15", series.getValue("startsOn").jsonPrimitive.content)
            assertEquals("18:30", series.getValue("timeOfDay").jsonPrimitive.content)
            assertEquals("50", series.getValue("durationMinutes").jsonPrimitive.content)
            assertEquals("America/Sao_Paulo", series.getValue("timeZone").jsonPrimitive.content)
            assertEquals("2", series.getValue("byWeekday").jsonPrimitive.content)
            val order = backend.requests.filter { it.method != "GET" }.map { "${it.method} ${it.requestUrl?.encodedPath}" }
            assertEquals(listOf("POST /api/recurrences", "PATCH /api/tasks/task-1"), order)
            assertEquals(
                buildJsonObject {
                    put("expectedRevision", 4)
                    put("name", "Reunião renomeada")
                },
                body(backend.requestsTo("PATCH", "/api/tasks/task-1").single()),
            )
        }

    @Test
    fun `a standalone task with only a new rule sends no task patch`() =
        runTest {
            serveTask("full", "/api/tasks/task-1")
            backend.route("POST", "/api/recurrences", json(Fixtures.json("recurrence-created"), 201))
            val viewModel = newViewModel("task-1")
            viewModel.await { true }
            viewModel.defineRecurrence()

            viewModel.save()
            viewModel.await { it.done }

            assertEquals(1, backend.requestsTo("POST", "/api/recurrences").size)
            assertEquals(0, backend.requestsTo("PATCH", "/api/tasks/task-1").size)
        }

    @Test
    fun `a persistent task ignores the rule`() =
        runTest {
            serveTask("full", "/api/tasks/task-1")
            backend.route("PATCH", "/api/tasks/task-1", noContent())
            val viewModel = newViewModel("task-1")
            viewModel.await { true }
            viewModel.defineRecurrence()
            viewModel.update { it.copy(longRunning = true) }

            viewModel.save()
            viewModel.await { it.done }

            assertEquals(0, backend.requestsTo("POST", "/api/recurrences").size)
            assertEquals(1, backend.requestsTo("PATCH", "/api/tasks/task-1").size)
        }

    @Test
    fun `an occurrence reads its series and opens the editor on its rule`() =
        runTest {
            serveTask("occurrence", "/api/tasks/task-occ")
            serveSeries(weekly)
            val viewModel = newViewModel("task-occ")

            val form = viewModel.await { it.recurrence.series is SeriesLoad.Ready }

            assertEquals("rec-1", form.recurrence.occurrence?.id)
            assertEquals(RecurrenceFrequency.Weekly, form.recurrence.draft?.frequency)
            assertEquals(42, form.recurrence.draft?.weekdays)
            assertEquals(1, backend.requestsTo("GET", seriesPath).size)
        }

    @Test
    fun `saving an occurrence without touching anything sends nothing`() =
        runTest {
            serveTask("occurrence", "/api/tasks/task-occ")
            serveSeries(weekly)
            val viewModel = newViewModel("task-occ")
            viewModel.await { it.recurrence.series is SeriesLoad.Ready }

            viewModel.save()

            assertTrue(viewModel.current.done)
            assertEquals(0, backend.requests.count { it.method != "GET" })
        }

    @Test
    fun `changing the rule of an occurrence patches the series with its revision`() =
        runTest {
            serveTask("occurrence", "/api/tasks/task-occ")
            serveSeries(weekly)
            backend.route("PATCH", seriesPath, noContent())
            val viewModel = newViewModel("task-occ")
            viewModel.await { it.recurrence.series is SeriesLoad.Ready }
            // A série é seg, qua e sex (42): quarta (bit 3) sai e sábado (bit 6) entra.
            viewModel.changeRecurrence { it.copy(weekdays = it.weekdays xor (1 shl 3) xor (1 shl 6)) }

            viewModel.save()
            viewModel.await { it.done }

            assertEquals(
                buildJsonObject {
                    put("expectedRevision", 3)
                    put("byWeekday", 42 xor 8 xor 64)
                },
                body(backend.requestsTo("PATCH", seriesPath).single()),
            )
            assertEquals(0, backend.requestsTo("PATCH", "/api/tasks/task-occ").size)
        }

    @Test
    fun `a rule the screen refuses stops the request`() =
        runTest {
            serveTask("occurrence", "/api/tasks/task-occ")
            serveSeries(weekly)
            val viewModel = newViewModel("task-occ")
            viewModel.await { it.recurrence.series is SeriesLoad.Ready }
            viewModel.changeRecurrence { it.copy(weekdays = 0, interval = 0) }

            viewModel.save()

            val errors = viewModel.current.recurrence.errors
            assertEquals(setOf(RecurrenceField.Interval, RecurrenceField.Weekdays), errors.keys)
            assertEquals(0, backend.requests.count { it.method != "GET" })
        }

    @Test
    fun `a stale series rereads the task and the series, keeps the rule typed and warns`() =
        runTest {
            serveTask("occurrence", "/api/tasks/task-occ")
            serveSeries(weekly, Fixtures.json("recurrence-series-reloaded"))
            backend.route("PATCH", seriesPath, status(409))
            val viewModel = newViewModel("task-occ")
            viewModel.await { it.recurrence.series is SeriesLoad.Ready }
            viewModel.changeRecurrence { it.copy(interval = 2) }

            viewModel.save()

            val form = viewModel.await { it.failure != null && (it.recurrence.series as? SeriesLoad.Ready)?.series?.revision == 4 }
            assertEquals(STALE_FORM_NOTICE, form.failure)
            assertEquals(2, backend.requestsTo("GET", "/api/tasks/task-occ").size)
            assertEquals(2, backend.requestsTo("GET", seriesPath).size)
            assertEquals(2, form.recurrence.draft?.interval)

            backend.route("PATCH", seriesPath, noContent())
            viewModel.save()
            viewModel.await { it.done }
            val retry = body(backend.requestsTo("PATCH", seriesPath).last())
            assertEquals("4", retry.getValue("expectedRevision").jsonPrimitive.content)
            assertEquals("2", retry.getValue("interval").jsonPrimitive.content)
        }

    @Test
    fun `deleting the series sends DELETE and rereads the task and the series, which is gone`() =
        runTest {
            serveTask("occurrence", "/api/tasks/task-occ")
            backend.route("GET", seriesPath, json(weekly), status(404))
            backend.route("DELETE", seriesPath, noContent())
            val viewModel = newViewModel("task-occ")
            viewModel.await { it.recurrence.series is SeriesLoad.Ready }

            viewModel.deleteSeries()

            val form = viewModel.await { it.recurrence.series == SeriesLoad.Gone }
            assertFalse(form.recurrence.deleting)
            assertEquals(1, backend.requestsTo("DELETE", seriesPath).size)
            assertEquals(2, backend.requestsTo("GET", "/api/tasks/task-occ").size)
        }

    @Test
    fun `a failed delete says so and keeps the series`() =
        runTest {
            serveTask("occurrence", "/api/tasks/task-occ")
            serveSeries(weekly)
            backend.route("DELETE", seriesPath, status(500))
            val viewModel = newViewModel("task-occ")
            viewModel.await { it.recurrence.series is SeriesLoad.Ready }

            viewModel.deleteSeries()

            val form = viewModel.await { it.recurrence.deleteFailed }
            assertTrue(form.recurrence.series is SeriesLoad.Ready)
            assertFalse(form.recurrence.deleting)
        }

    @Test
    fun `a series that no longer exists, or that fails to load, is told apart`() =
        runTest {
            serveTask("occurrence", "/api/tasks/task-occ")
            backend.route("GET", seriesPath, status(404))
            assertEquals(SeriesLoad.Gone, newViewModel("task-occ").await { it.recurrence.series != SeriesLoad.Loading }.recurrence.series)

            backend.route("GET", seriesPath, status(500))
            assertEquals(SeriesLoad.Failed, newViewModel("task-occ").await { it.recurrence.series != SeriesLoad.Loading }.recurrence.series)
        }

    @Test
    fun `a task that is not an occurrence has no series to read`() =
        runTest {
            serveTask("full", "/api/tasks/task-1")
            val viewModel = newViewModel("task-1")

            val form = viewModel.await { true }

            assertEquals(SeriesLoad.None, form.recurrence.series)
            assertNull(form.recurrence.draft)
            assertNull(form.recurrence.occurrence)
            assertEquals(0, backend.requestsTo("GET", seriesPath).size)
        }
}
