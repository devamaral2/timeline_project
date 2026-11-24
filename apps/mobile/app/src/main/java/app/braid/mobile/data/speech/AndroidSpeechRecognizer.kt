package app.braid.mobile.data.speech

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.RecognizerIntent
import app.braid.mobile.domain.speech.SpeechError
import app.braid.mobile.domain.speech.SpeechListener
import app.braid.mobile.domain.speech.SpeechRecognizer
import app.braid.mobile.domain.speech.SpeechSegment
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import android.speech.SpeechRecognizer as PlatformRecognizer

private const val SILENCE_HINT_MS = 1_800L
private const val REOPEN_DELAY_MS = 120L
private const val GOOGLE_PACKAGE = "com.google.android.googlequicksearchbox"

/**
 * O `SpeechRecognizer` do Android em pt-BR por trás de [SpeechRecognizer]. O do sistema encerra a sessão na primeira pausa,
 * e o web ouve de forma contínua: aqui, quando uma sessão do sistema termina com frases e ninguém pediu para parar, outra
 * abre em seguida e o resultado segue cumulativo. Quem decide que a voz acabou é [app.braid.mobile.domain.speech.SpeechDictation]
 * (o silêncio de 1,8 s) ou a pessoa. Tudo roda na thread principal, como o sistema exige.
 *
 * Sem emulador não há teste instrumentado desta classe: a lógica de decisão vive em `SpeechDictation`, testada com um falso.
 */
class AndroidSpeechRecognizer
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) : SpeechRecognizer {
        private val handler = Handler(Looper.getMainLooper())
        private var platform: PlatformRecognizer? = null
        private var listener: SpeechListener? = null

        /** As frases fechadas das sessões do sistema já terminadas e a que ainda está saindo. */
        private val finals = mutableListOf<String>()
        private var partial = ""
        private var stopping = false
        private var running = false

        override val available: Boolean get() = recognizerService() != null

        override fun start(listener: SpeechListener) {
            check(available) { "O aparelho não tem reconhecimento de voz" }
            teardown()
            this.listener = listener
            finals.clear()
            partial = ""
            stopping = false
            open()
        }

        override fun stop() {
            if (listener == null) return
            stopping = true
            handler.removeCallbacksAndMessages(null)
            if (running) platform?.stopListening() else finish()
        }

        override fun cancel() {
            teardown()
        }

        private fun open() {
            val service = checkNotNull(recognizerService()) { "O aparelho não tem reconhecimento de voz" }
            val recognizer = platform ?: PlatformRecognizer.createSpeechRecognizer(context, service).also { platform = it }
            recognizer.setRecognitionListener(Callbacks())
            running = true
            recognizer.startListening(intent())
        }

        /**
         * O reconhecedor do aparelho que ouve o ditado: o padrão do sistema, ou o do Google, ou o primeiro que houver. Nunca o
         * do próprio app, que existe só para o Braid poder ser o assistente digital e recusa todo pedido.
         */
        private fun recognizerService(): ComponentName? {
            val others =
                context.packageManager
                    .queryIntentServices(Intent(RecognitionService.SERVICE_INTERFACE), 0)
                    .map { ComponentName(it.serviceInfo.packageName, it.serviceInfo.name) }
                    .filter { it.packageName != context.packageName }
            val default =
                Settings.Secure
                    .getString(
                        context.contentResolver,
                        "voice_recognition_service",
                    )?.let(ComponentName::unflattenFromString)
            return others.firstOrNull { it == default }
                ?: others.firstOrNull { it.packageName == GOOGLE_PACKAGE }
                ?: others.firstOrNull()
        }

        private fun intent() =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, SILENCE_HINT_MS)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, SILENCE_HINT_MS)
            }

        private fun report() {
            val segments =
                finals.map { SpeechSegment(it, isFinal = true) } +
                    listOfNotNull(partial.takeIf { it.isNotBlank() }?.let { SpeechSegment(it, false) })
            listener?.onResults(segments)
        }

        /** A sessão do sistema acabou sem erro: a pessoa pediu para parar, ou a pausa a encerrou e outra abre. */
        private fun platformEnded() {
            running = false
            if (stopping) {
                finish()
            } else {
                handler.postDelayed({ if (listener != null && !stopping) open() }, REOPEN_DELAY_MS)
            }
        }

        /** A fala parcial que o sistema não chegou a fechar entra como frase, para não se perder ao parar. */
        private fun finish() {
            if (partial.isNotBlank()) {
                finals += partial.trim()
                partial = ""
                report()
            }
            val current = listener
            teardown()
            current?.onEnded()
        }

        private fun teardown() {
            handler.removeCallbacksAndMessages(null)
            listener = null
            running = false
            platform?.let {
                it.setRecognitionListener(null)
                it.destroy()
            }
            platform = null
        }

        private inner class Callbacks : RecognitionListener {
            override fun onPartialResults(partialResults: Bundle?) {
                partial = partialResults.firstText()
                report()
            }

            override fun onResults(results: Bundle?) {
                val text = results.firstText()
                if (text.isNotBlank()) finals += text.trim()
                partial = ""
                report()
                platformEnded()
            }

            override fun onError(error: Int) {
                // Pausa sem fala (6) e sem correspondência (7) depois de ouvir algo só encerram a sessão do sistema.
                val silent = error == PlatformRecognizer.ERROR_SPEECH_TIMEOUT || error == PlatformRecognizer.ERROR_NO_MATCH
                if (silent && (finals.isNotEmpty() || partial.isNotBlank() || stopping)) {
                    platformEnded()
                    return
                }
                val current = listener
                current?.onError(errorOf(error))
                teardown()
                current?.onEnded()
            }

            override fun onReadyForSpeech(params: Bundle?) = Unit

            override fun onBeginningOfSpeech() = Unit

            override fun onRmsChanged(rmsdB: Float) = Unit

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() = Unit

            override fun onEvent(
                eventType: Int,
                params: Bundle?,
            ) = Unit
        }
    }

private fun Bundle?.firstText(): String =
    this
        ?.getStringArrayList(PlatformRecognizer.RESULTS_RECOGNITION)
        ?.firstOrNull()
        .orEmpty()

private fun errorOf(code: Int): SpeechError =
    when (code) {
        PlatformRecognizer.ERROR_SPEECH_TIMEOUT, PlatformRecognizer.ERROR_NO_MATCH -> SpeechError.NoSpeech
        PlatformRecognizer.ERROR_AUDIO -> SpeechError.AudioCapture
        PlatformRecognizer.ERROR_NETWORK, PlatformRecognizer.ERROR_NETWORK_TIMEOUT, PlatformRecognizer.ERROR_SERVER -> SpeechError.Network
        PlatformRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> SpeechError.NotAllowed
        PlatformRecognizer.ERROR_CLIENT -> SpeechError.Aborted
        else -> SpeechError.Unknown
    }
