package app.braid.mobile.data.network

import app.braid.mobile.data.auth.AuthApi
import app.braid.mobile.data.auth.AuthClient
import app.braid.mobile.data.session.SessionRepository
import app.braid.mobile.data.session.SessionSnapshot
import app.braid.mobile.data.session.SessionState
import app.braid.mobile.data.session.SessionUser
import app.braid.mobile.data.session.TokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.atomic.AtomicInteger

class AuthNetworkingTest {
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
    fun bearer401RefreshesOnceAndRetriesWithTheRotatedAccessToken() =
        runBlocking {
            val store = FakeTokenStore(snapshot())
            val session = SessionRepository(store)
            val authApi = authApi()
            server.enqueue(MockResponse().setResponseCode(401))
            server.enqueue(jsonResponse(200, """{"accessToken":"new-access","refreshToken":"new-refresh"}"""))
            server.enqueue(jsonResponse(200, """{"ok":true}"""))

            val response = client(store, session, authApi).newCall(apiRequest()).execute()

            assertEquals(200, response.code)
            assertEquals("new-access", store.snapshot?.accessToken)
            assertEquals("Bearer old-access", server.takeRequest().getHeader("Authorization"))
            assertEquals("/auth/token/refresh", server.takeRequest().path)
            assertEquals("Bearer new-access", server.takeRequest().getHeader("Authorization"))
        }

    @Test
    fun failedRefreshClearsTheSessionAndDoesNotRetryForever() =
        runBlocking {
            val store = FakeTokenStore(snapshot())
            val session = SessionRepository(store)
            server.enqueue(MockResponse().setResponseCode(401))
            server.enqueue(MockResponse().setResponseCode(401))

            val response = client(store, session, authApi()).newCall(apiRequest()).execute()

            assertEquals(401, response.code)
            assertNull(store.snapshot)
            assertEquals(SessionState.SignedOut, session.state.value)
        }

    @Test
    fun concurrent401sShareOneRefreshAndBothRetry() =
        runBlocking {
            val store = FakeTokenStore(snapshot())
            val session = SessionRepository(store)
            val refreshes = AtomicInteger(0)
            val apiCalls = AtomicInteger(0)
            server.dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                        if (request.path == "/auth/token/refresh") {
                            refreshes.incrementAndGet()
                            Thread.sleep(100)
                            return jsonResponse(200, """{"accessToken":"new-access","refreshToken":"new-refresh"}""")
                        }
                        return if (apiCalls.incrementAndGet() <= 2) {
                            MockResponse().setResponseCode(401)
                        } else {
                            jsonResponse(200, """{"ok":true}""")
                        }
                    }
                }

            val http = client(store, session, authApi())
            val codes =
                coroutineScope {
                    listOf(
                        async(Dispatchers.IO) { http.newCall(apiRequest()).execute().use { it.code } },
                        async(Dispatchers.IO) { http.newCall(apiRequest()).execute().use { it.code } },
                    ).awaitAll()
                }

            assertEquals(listOf(200, 200), codes.sorted())
            assertEquals(1, refreshes.get())
        }

    @Test
    fun authClientPreservesRateLimitErrorAndRetryAfter() =
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(429)
                    .setHeader("Retry-After", "7")
                    .setBody("{}"),
            )

            val result = AuthClient(authApi()).login("user@example.com", "wrong")

            assertTrue(result is app.braid.mobile.data.auth.AuthResult.Failure)
            val error = (result as app.braid.mobile.data.auth.AuthResult.Failure).error
            assertEquals(AuthErrorKind.RateLimited, error.kind)
            assertEquals(429, error.status)
            assertEquals("7", error.retryAfter)
        }

    private fun authApi(): AuthApi =
        Retrofit
            .Builder()
            .baseUrl(server.url("/"))
            .addConverterFactory(Json { ignoreUnknownKeys = true }.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(AuthApi::class.java)

    private fun client(
        store: TokenStore,
        session: SessionRepository,
        authApi: AuthApi,
    ): OkHttpClient =
        OkHttpClient
            .Builder()
            .addInterceptor(AuthInterceptor(store))
            .authenticator(TokenAuthenticator(store, session, authApi))
            .build()

    private fun apiRequest(): Request = Request.Builder().url(server.url("/api/events")).build()

    private fun jsonResponse(
        code: Int,
        body: String,
    ): MockResponse =
        MockResponse()
            .setResponseCode(code)
            .setHeader("Content-Type", "application/json")
            .setBody(body)

    private fun snapshot() =
        SessionSnapshot(
            accessToken = "old-access",
            refreshToken = "old-refresh",
            user = SessionUser("user-1", "user@example.com", "User", "session-1"),
        )

    private class FakeTokenStore(
        initial: SessionSnapshot?,
    ) : TokenStore {
        @Volatile
        var snapshot: SessionSnapshot? = initial

        override suspend fun read(): SessionSnapshot? = snapshot

        override suspend fun write(snapshot: SessionSnapshot) {
            this.snapshot = snapshot
        }

        override suspend fun clear() {
            snapshot = null
        }
    }
}
