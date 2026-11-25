package app.braid.mobile.domain.markdown

import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** `youtubeVideoOf` contra o que a função TS do web devolveu para os mesmos endereços. */
class YouTubeFixturesTest {
    @Test
    fun `a video address is read as the web reads it`() {
        val cases = fixtureCases("youtube-functions", "youtubeVideoOf")
        for (case in cases) {
            val actual = youtubeVideoOf(case.string(0))
            if (case.result is JsonNull) {
                assertNull(case.toString(), actual)
            } else {
                val expected = case.result.jsonObject
                assertEquals(case.toString(), expected.getValue("id").jsonPrimitive.content, actual?.id)
                assertEquals(case.toString(), expected["startSeconds"]?.jsonPrimitive?.int, actual?.startSeconds)
            }
        }
    }
}
