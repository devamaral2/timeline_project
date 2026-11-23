package app.braid.mobile.domain.speech

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** O que a escuta mostra: se o microfone está aberto, o que já foi ouvido e o último erro (apagado ao recomeçar). */
data class DictationState(
    val listening: Boolean = false,
    /** Tudo o que a sessão ouviu: as frases fechadas e a que ainda está saindo. */
    val heard: String = "",
    val error: SpeechError? = null,
)

/**
 * Uma escuta com entrega: abre a sessão do [SpeechRecognizer], junta o que foi ouvido e, ao fim, entrega o texto. Fim por
 * [stop] (um toque na pessoa) vai para [onFinalTranscript]; fim pela voz que parou (o [silenceMs] sem resultado novo, ou o
 * próprio reconhecedor) vai para [onSilenceTranscript], se houver. Sem [onSilenceTranscript] e sem [silenceMs] a escuta é
 * passiva: só a pessoa a encerra. É o `useSpeechRecognition` do web.
 */
class SpeechDictation(
    private val recognizer: SpeechRecognizer,
    private val scope: CoroutineScope,
    private val silenceMs: Long = 0,
    private val onFinalTranscript: (String) -> Unit,
    private val onSilenceTranscript: ((String) -> Unit)? = null,
) {
    private val mutableState = MutableStateFlow(DictationState())
    val state: StateFlow<DictationState> = mutableState.asStateFlow()

    val available: Boolean get() = recognizer.available

    private var session: Session? = null
    private var silenceTimer: Job? = null

    private inner class Session : SpeechListener {
        var finals = ""
        var stoppedByPerson = false
        var submitted = false

        // O resultado é cumulativo e o reconhecedor reentrega frases já fechadas: reconstruir a lista inteira deixa o
        // tratamento idempotente. Somar o que chega repetiria a frase a cada reentrega.
        override fun onResults(segments: List<SpeechSegment>) {
            if (session !== this) return
            finals = segments.filter { it.isFinal }.joinToString("") { "${it.text} " }
            val pending = segments.filterNot { it.isFinal }.joinToString("") { it.text }
            val heard = "$finals$pending".trim()
            mutableState.value = mutableState.value.copy(heard = heard)
            // A voz parou: cada resultado novo recomeça a contagem; quando ela vence, encerra e o fim entrega o que foi dito.
            silenceTimer?.cancel()
            if (silenceMs > 0 && heard.isNotEmpty()) {
                silenceTimer =
                    scope.launch {
                        delay(silenceMs)
                        recognizer.stop()
                    }
            }
        }

        override fun onError(error: SpeechError) {
            if (session !== this) return
            mutableState.value = mutableState.value.copy(error = error)
        }

        override fun onEnded() {
            if (session !== this) return
            silenceTimer?.cancel()
            session = null
            mutableState.value = mutableState.value.copy(listening = false, heard = "")
            val transcript = finals.trim()
            // O reconhecedor pode terminar duas vezes; sem a guarda sairiam duas entregas.
            if (submitted || transcript.isEmpty()) return
            submitted = true
            val bySilence = onSilenceTranscript
            if (bySilence != null && !stoppedByPerson) bySilence(transcript) else onFinalTranscript(transcript)
        }
    }

    /** Abre a sessão; já aberta, não faz nada. Um reconhecedor que não começa vira o erro genérico. */
    fun start() {
        if (session != null) return
        val next = Session()
        session = next
        mutableState.value = DictationState(listening = true)
        try {
            recognizer.start(next)
        } catch (_: Exception) {
            session = null
            mutableState.value = DictationState(error = SpeechError.Unknown)
        }
    }

    /** A pessoa pediu para parar: o que foi ouvido segue para [onFinalTranscript]. */
    fun stop() {
        val current = session ?: return
        current.stoppedByPerson = true
        silenceTimer?.cancel()
        recognizer.stop()
    }

    /** Desliga o microfone sem entregar o que foi ouvido. */
    fun cancel() {
        silenceTimer?.cancel()
        if (session == null) return
        session = null
        recognizer.cancel()
        mutableState.value = mutableState.value.copy(listening = false, heard = "")
    }
}
