package app.braid.mobile.domain.transcription

import app.braid.mobile.domain.markdown.soleYouTubeVideoLink
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.support.Fixtures
import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** As regras e os textos do pedido de transcrição contra o que o web devolveu para as mesmas entradas. */
class TranscriptionFixturesTest {
    @Test
    fun `a message that is only a video link is read as the web reads it`() {
        for (case in fixtureCases("transcription-functions", "soleYouTubeVideoLink")) {
            val actual = soleYouTubeVideoLink(case.string(0))
            if (case.result is JsonNull) assertNull(case.toString(), actual) else assertEquals(case.toString(), case.resultString, actual)
        }
    }

    @Test
    fun `the daily reading is recognised as the web recognises it`() {
        for (case in fixtureCases("transcription-functions", "isDailyReading")) {
            assertEquals(case.toString(), case.resultBoolean, isDailyReading(TaskActor.Human, case.string(0)))
        }
        assertEquals(false, isDailyReading(TaskActor.Agent, "Leitura diária"))
    }

    @Test
    fun `the texts are the ones the web shows`() {
        val web = Fixtures.json("transcription-texts").jsonObject

        fun text(key: String) = web.getValue(key).jsonPrimitive.content
        assertEquals(text("chatPending"), TranscriptionText.CHAT_PENDING)
        assertEquals(text("chatQueued"), TranscriptionText.CHAT_QUEUED)
        assertEquals(text("chatAgain"), TranscriptionText.CHAT_AGAIN)
        assertEquals(text("invalidLink"), TranscriptionText.INVALID_LINK)
        assertEquals(text("formQueued"), TranscriptionText.FORM_QUEUED)
        assertEquals(text("formAgain"), TranscriptionText.FORM_AGAIN)
        assertEquals(text("formFailed"), TranscriptionText.FORM_FAILED)
        assertEquals(text("dailyReading"), TranscriptionText.DAILY_READING)
    }
}
