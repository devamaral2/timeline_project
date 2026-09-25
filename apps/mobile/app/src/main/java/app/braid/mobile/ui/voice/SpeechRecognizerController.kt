package app.braid.mobile.ui.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

data class SpeechRecognizerUiState(
    val supported: Boolean,
    val listening: Boolean = false,
    val interim: String = "",
    val error: String? = null,
)

class SpeechRecognizerController(
    private val context: Context,
    private val onFinalTranscript: (String) -> Unit,
) {
    var state by mutableStateOf(
        SpeechRecognizerUiState(supported = SpeechRecognizer.isRecognitionAvailable(context)),
    )
        private set

    private var recognizer: SpeechRecognizer? = null
    private var stoppingByUser = false

    fun start() {
        if (state.listening) return
        if (!state.supported) {
            state = state.copy(error = "Reconhecimento de voz indisponível neste dispositivo.")
            return
        }

        stoppingByUser = false
        state = state.copy(listening = true, interim = "", error = null)
        recognizer?.destroy()
        recognizer = createRecognizer()
        recognizer?.setRecognitionListener(listener)
        recognizer?.startListening(recognizerIntent())
    }

    fun stop() {
        if (!state.listening) return
        stoppingByUser = true
        recognizer?.stopListening()
    }

    fun permissionDenied() {
        state = state.copy(error = "Permita o acesso ao microfone para gravar.")
    }

    fun release() {
        stoppingByUser = true
        recognizer?.destroy()
        recognizer = null
        state = state.copy(listening = false, interim = "")
    }

    private fun createRecognizer(): SpeechRecognizer? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        } else {
            SpeechRecognizer.createSpeechRecognizer(context)
        }

    private fun recognizerIntent(): Intent =
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            }
        }

    private val listener =
        object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit

            override fun onBeginningOfSpeech() = Unit

            override fun onRmsChanged(rmsdB: Float) = Unit

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() {
                state = state.copy(listening = false)
            }

            override fun onError(error: Int) {
                state =
                    state.copy(
                        listening = false,
                        interim = "",
                        error = speechErrorMessage(error, stoppingByUser),
                    )
                stoppingByUser = false
            }

            override fun onResults(results: Bundle?) {
                val transcript =
                    results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        ?.trim()
                        .orEmpty()
                state = state.copy(listening = false, interim = "")
                if (transcript.isNotEmpty()) onFinalTranscript(transcript)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val transcript =
                    partialResults
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()
                        .orEmpty()
                state = state.copy(interim = transcript)
            }

            override fun onEvent(
                eventType: Int,
                params: Bundle?,
            ) = Unit
        }
}
