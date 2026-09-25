package app.braid.mobile.data.events

import app.braid.mobile.data.network.AuthInterceptor
import app.braid.mobile.data.session.SessionSnapshot
import app.braid.mobile.data.session.TokenStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class EventRepositoryTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun dayUsesTheSameSaoPauloWindowAsTheWebAndCachesTheFirstPage() {
        runBlocking {
            server.enqueue(jsonResponse("{\"items\":[],\"nextCursor\":\"cursor-2\"}"))
            val repository = EventRepository(api())

            val first = repository.day("2026-08-31")
            val second = repository.day("2026-08-31")
            val request = server.takeRequest()

            assertTrue(first is EventResult.Success && !first.fromCache)
            assertTrue(second is EventResult.Success && second.fromCache)
            assertEquals("2026-08-31T03:00:00.000Z", request.requestUrl?.queryParameter("from"))
            assertEquals("2026-09-01T02:59:59.999Z", request.requestUrl?.queryParameter("to"))
            assertEquals("cursor-2", (first as EventResult.Success).value.nextCursor)
            assertEquals(1, server.requestCount)
        }
    }

    @Test
    fun cursorAndFiltersAreForwardedAndForceRefreshBypassesTheCache() {
        runBlocking {
            server.enqueue(jsonResponse("{\"items\":[]}"))
            server.enqueue(jsonResponse("{\"items\":[]}"))
            val repository = EventRepository(api())
            val query = EventQuery(type = "meal", tag = "foco", cursor = "cursor-2", limit = 20)

            repository.day("2026-08-31", query)
            repository.day("2026-08-31", query, forceRefresh = true)
            val first = server.takeRequest()
            val second = server.takeRequest()

            assertEquals("meal", first.requestUrl?.queryParameter("type"))
            assertEquals("foco", first.requestUrl?.queryParameter("tag"))
            assertEquals("cursor-2", first.requestUrl?.queryParameter("cursor"))
            assertEquals("20", first.requestUrl?.queryParameter("limit"))
            assertEquals(first.path, second.path)
            assertEquals(2, server.requestCount)
        }
    }

    @Test
    fun serverErrorsRemainTypedForTheViewModel() {
        runBlocking {
            server.enqueue(MockResponse().setResponseCode(503))
            val result = EventRepository(api()).day("2026-08-31")

            assertEquals(EventResult.Failure(EventRepositoryError(EventErrorKind.Http, 503)), result)
        }
    }

    @Test
    fun detailForwardsTheEventIdAndDecodesTasks() {
        runBlocking {
            server.enqueue(
                jsonResponse(
                    """{"id":"event-1","name":"Rotina","description":"","startedAt":"2026-09-22T08:00:00Z","finishedAt":"2026-09-22T09:00:00Z","tags":[],"missed":false,"priority":"normal","notifyOffsetsMinutes":[],"interruptions":[],"revision":1,"primaryItemId":"item-1","items":[{"type":"routine","id":"item-1","position":0,"schemaVersion":1,"isPrimary":true,"data":{}}],"taskIds":["task-1"]}""",
                ),
            )
            val result = EventRepository(api()).detail("event-1")
            val request = server.takeRequest()

            assertEquals("/api/events/event-1", request.path)
            assertTrue(result is EventResult.Success)
            assertEquals(listOf("task-1"), (result as EventResult.Success).value.taskIds)
        }
    }

    @Test
    fun deleteForwardsTheEventIdAndAcceptsNoContent() {
        runBlocking {
            server.enqueue(MockResponse().setResponseCode(204))

            val result = EventRepository(api()).delete("event-1")
            val request = server.takeRequest()

            assertEquals("DELETE", request.method)
            assertEquals("/api/events/event-1", request.path)
            assertEquals(EventResult.Success(Unit), result)
        }
    }

    private fun api(): EventsApi =
        Retrofit
            .Builder()
            .baseUrl(server.url("/"))
            .client(OkHttpClient.Builder().addInterceptor(AuthInterceptor(EmptyTokenStore())).build())
            .addConverterFactory(Json { ignoreUnknownKeys = true }.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(EventsApi::class.java)

    private fun jsonResponse(body: String): MockResponse =
        MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json").setBody(body)

    private class EmptyTokenStore : TokenStore {
        override suspend fun read(): SessionSnapshot? = null

        override suspend fun write(snapshot: SessionSnapshot) = Unit

        override suspend fun clear() = Unit
    }
}
