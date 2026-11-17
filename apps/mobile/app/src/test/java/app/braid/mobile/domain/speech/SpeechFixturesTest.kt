package app.braid.mobile.domain.speech

import app.braid.mobile.support.fixtureCases
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A fala que encerra a escuta e os textos de erro de voz, contra o que as funções do web devolveram para as mesmas entradas. */
class SpeechFixturesTest {
    @Test
    fun `the spoken request to stop is recognised as the web recognises it`() {
        for (case in fixtureCases("speech-functions", "isStopSpeech")) {
            assertEquals(case.toString(), case.resultBoolean, isStopSpeech(case.string(0)))
        }
    }

    @Test
    fun `the speech error messages are the web ones`() {
        for (case in fixtureCases("speech-functions", "speechErrorMessage")) {
            val actual = speechErrorMessage(SpeechError.fromCode(case.string(0)))
            if (case.result is JsonNull) assertNull(case.toString(), actual) else assertEquals(case.toString(), case.resultString, actual)
        }
    }
}
