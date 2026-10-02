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

class VoiceEventRepositoryTest {
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
    fun createForwardsTranscriptAndDecodesCreatedEvent() {
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(201)
                    .setHeader("Content-Type", "application/json")
                    .setBody("{\"eventId\":\"event-1\",\"primaryItemType\":\"meal\"}"),
            )

            val result = VoiceEventRepository(api()).create("café da manhã")
            val request = server.takeRequest()

            assertEquals("POST", request.method)
            assertEquals("/api/events/voice", request.path)
            assertTrue(request.body.readUtf8().contains("café da manhã"))
            assertEquals(
                EventResult.Success(
                    app.braid.mobile.data.dto
                        .VoiceEventResponseDto("event-1", "meal"),
                ),
                result,
            )
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

    private class EmptyTokenStore : TokenStore {
        override suspend fun read(): SessionSnapshot? = null

        override suspend fun write(snapshot: SessionSnapshot) = Unit

        override suspend fun clear() = Unit
    }
}
