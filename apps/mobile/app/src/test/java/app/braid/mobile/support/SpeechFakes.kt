package app.braid.mobile.support

import app.braid.mobile.domain.speech.MicrophonePermission
import app.braid.mobile.domain.speech.SpeechError
import app.braid.mobile.domain.speech.SpeechListener
import app.braid.mobile.domain.speech.SpeechRecognizer
import app.braid.mobile.domain.speech.SpeechSegment

/**
 * O reconhecedor de voz trocado: conta as sessões abertas e deixa o teste falar, errar e terminar como o do Android faria.
 * `stop()` entrega o que foi ouvido e termina, como o `SpeechRecognizer` do sistema; `cancel()` não entrega nada.
 */
class FakeSpeechRecognizer(
    override var available: Boolean = true,
) : SpeechRecognizer {
    var starts = 0
        private set
    var stops = 0
        private set
    var cancels = 0
        private set
    var failToStart = false
    private var listener: SpeechListener? = null
    val listening: Boolean get() = listener != null

    override fun start(listener: SpeechListener) {
        if (failToStart) error("sem microfone")
        starts += 1
        this.listener = listener
    }

    override fun stop() {
        stops += 1
        end()
    }

    override fun cancel() {
        cancels += 1
        listener = null
    }

    /** Tudo o que a sessão ouviu até agora (cumulativo, como o `event.results` do web). */
    fun hear(vararg segments: Pair<String, Boolean>) {
        listener?.onResults(segments.map { SpeechSegment(it.first, it.second) })
    }

    fun fail(error: SpeechError) {
        listener?.onError(error)
    }

    /** O reconhecedor terminou sozinho (o navegador decide que a voz acabou). */
    fun end() {
        val current = listener ?: return
        listener = null
        current.onEnded()
    }
}

class FakeMicrophone(
    var granted: Boolean = true,
) : MicrophonePermission {
    override fun isGranted(): Boolean = granted
}
