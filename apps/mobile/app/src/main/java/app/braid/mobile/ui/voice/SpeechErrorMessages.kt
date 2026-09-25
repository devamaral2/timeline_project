package app.braid.mobile.ui.voice

import android.speech.SpeechRecognizer

fun speechErrorMessage(
    code: Int,
    stoppedByUser: Boolean = false,
): String? {
    if (stoppedByUser || code == SpeechRecognizer.ERROR_CLIENT) return null
    return when (code) {
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Permita o acesso ao microfone para gravar."
        SpeechRecognizer.ERROR_NO_MATCH,
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
        -> "Não ouvi nada. Tente de novo."
        SpeechRecognizer.ERROR_AUDIO -> "Nenhum microfone encontrado."
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
        SpeechRecognizer.ERROR_SERVER,
        SpeechRecognizer.ERROR_SERVER_DISCONNECTED,
        -> "Sem conexão com o serviço de voz."
        else -> "Não foi possível gravar o áudio."
    }
}
