package app.braid.mobile.ui.voice

import android.speech.SpeechRecognizer
import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechErrorMessagesTest {
    @Test
    fun permissionAndNoSpeechUseTheWebMessages() {
        assertEquals(
            "Permita o acesso ao microfone para gravar.",
            speechErrorMessage(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS),
        )
        assertEquals(
            "Não ouvi nada. Tente de novo.",
            speechErrorMessage(SpeechRecognizer.ERROR_NO_MATCH),
        )
    }

    @Test
    fun userStopDoesNotSurfaceAnError() {
        assertEquals(null, speechErrorMessage(SpeechRecognizer.ERROR_CLIENT, stoppedByUser = true))
    }
}
