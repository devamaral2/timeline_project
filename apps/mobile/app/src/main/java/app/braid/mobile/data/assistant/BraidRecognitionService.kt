package app.braid.mobile.data.assistant

import android.content.Intent
import android.speech.RecognitionService
import android.speech.SpeechRecognizer

/**
 * O Android só lista um app como assistente digital se o serviço dele declara também um reconhecedor de fala. Este não
 * reconhece nada: recusa o pedido, e o ditado do chat usa o reconhecedor do próprio aparelho (veja
 * `AndroidSpeechRecognizer`, que nunca escolhe este).
 */
class BraidRecognitionService : RecognitionService() {
    override fun onStartListening(
        recognizerIntent: Intent?,
        listener: Callback,
    ) {
        listener.error(SpeechRecognizer.ERROR_CLIENT)
    }

    override fun onStopListening(listener: Callback) = Unit

    override fun onCancel(listener: Callback) = Unit
}
