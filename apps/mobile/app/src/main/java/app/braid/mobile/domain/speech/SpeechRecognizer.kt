package app.braid.mobile.domain.speech

/** Os erros de fala, com o código que a Web Speech API usa (o web traduz cada um para o texto da tela). */
enum class SpeechError(
    val code: String,
) {
    Aborted("aborted"),
    NotAllowed("not-allowed"),
    NoSpeech("no-speech"),
    AudioCapture("audio-capture"),
    Network("network"),
    Unknown("unknown"),
    ;

    companion object {
        /** Lê o código do web; `service-not-allowed` é `not-allowed`, e o que não existe é [Unknown]. */
        fun fromCode(code: String): SpeechError =
            when (code) {
                "service-not-allowed" -> NotAllowed
                else -> entries.firstOrNull { it.code == code } ?: Unknown
            }
    }
}

/** Uma frase ouvida: [isFinal] diz se o reconhecedor já a fechou ou se ainda pode mudá-la. */
data class SpeechSegment(
    val text: String,
    val isFinal: Boolean,
)

/** O que uma sessão de escuta avisa. Todas as chamadas chegam na thread principal. */
interface SpeechListener {
    /** Tudo o que a sessão ouviu até agora, cumulativo: cada chamada traz a lista inteira, não só o que mudou. */
    fun onResults(segments: List<SpeechSegment>)

    fun onError(error: SpeechError)

    /** A sessão acabou (por [SpeechRecognizer.stop], pelo silêncio ou por um erro); nada mais chega dela. */
    fun onEnded()
}

/**
 * O reconhecimento de voz em pt-BR, contínuo e com resultados parciais. É a fronteira que os testes trocam por um falso; o
 * chat (ticket 19) e as barras de edição por IA (ticket 20) usam o mesmo, por [SpeechDictation].
 */
interface SpeechRecognizer {
    /** O aparelho tem reconhecimento de voz; sem ele o botão do microfone nem aparece. */
    val available: Boolean

    /** Abre uma sessão. Pode lançar quando o reconhecedor não consegue começar. */
    fun start(listener: SpeechListener)

    /** Encerra a sessão entregando o que foi ouvido: [SpeechListener.onResults] e então [SpeechListener.onEnded]. */
    fun stop()

    /** Derruba a sessão sem entregar nada: quem chamou fica com o texto que já tem. */
    fun cancel()
}

/** A permissão de microfone do app. Pedi-la ao sistema é da tela; aqui só se pergunta se já existe. */
interface MicrophonePermission {
    fun isGranted(): Boolean
}

/** Sem reconhecimento de voz: o chat segue só por texto. */
object NoSpeechRecognizer : SpeechRecognizer {
    override val available = false

    override fun start(listener: SpeechListener) = Unit

    override fun stop() = Unit

    override fun cancel() = Unit
}

object GrantedMicrophone : MicrophonePermission {
    override fun isGranted() = true
}
