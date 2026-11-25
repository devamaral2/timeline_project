package app.braid.mobile.core.network

import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** As imagens de um documento vão a servidores de terceiros: nada que identifique a pessoa ou o app vai junto. */
class ThirdPartyHttpClientTest {
    @Test
    fun `an image request carries no referer, no auth header and no cookie`() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("png"))
            server.start()
            val request =
                Request
                    .Builder()
                    .url(server.url("/a.png"))
                    .header("Referer", "https://app.braid/doc")
                    .header("Authorization", "Bearer segredo")
                    .header("Cookie", "sessao=1")
                    .header("Origin", "https://app.braid")
                    .build()

            thirdPartyHttpClient().newCall(request).execute().use { assertEquals(200, it.code) }

            val received = server.takeRequest()
            assertNull(received.getHeader("Referer"))
            assertNull(received.getHeader("Authorization"))
            assertNull(received.getHeader("Cookie"))
            assertNull(received.getHeader("Origin"))
        }
    }

    @Test
    fun `the third party client keeps no cookies from a response`() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().addHeader("Set-Cookie", "rastro=1").setBody("png"))
            server.enqueue(MockResponse().setBody("png"))
            server.start()
            val client = thirdPartyHttpClient()
            repeat(2) { client.newCall(Request.Builder().url(server.url("/a.png")).build()).execute().close() }

            server.takeRequest()
            assertNull(server.takeRequest().getHeader("Cookie"))
        }
    }
}
