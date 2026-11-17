package app.braid.mobile.ui.aiedit

import app.braid.mobile.domain.speech.MicrophonePermission
import app.braid.mobile.domain.speech.SpeechDictation
import app.braid.mobile.domain.speech.SpeechError
import app.braid.mobile.domain.speech.SpeechRecognizer
import app.braid.mobile.domain.speech.speechErrorMessage
import app.braid.mobile.ui.chat.VoiceUiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * O microfone passivo de um campo de pedido (a barra de edição, o rodapé da tarefa de agente, o campo do arquivo do
 * Hermes): só dita. O que foi ouvido vai para [onTranscript] quando a pessoa para a escuta, e nunca envia nada; o silêncio
 * não encerra. É o `useSpeechRecognition` sem `silenceMs` que essas barras usam no web.
 *
 * Cada mudança chega a [onVoice]; a tela a mostra e, com `askPermission`, abre o pedido de permissão do sistema e devolve a resposta em
 * [permissionResult].
 */
class DraftDictation(
    private val speech: SpeechRecognizer,
    private val microphone: MicrophonePermission,
    scope: CoroutineScope,
    private val onVoice: (VoiceUiState) -> Unit,
    onTranscript: (String) -> Unit,
) {
    private val dictation = SpeechDictation(recognizer = speech, scope = scope, onFinalTranscript = onTranscript)
    private var askingPermission = false
    private var permissionNotice: String? = null
    val listening: Boolean get() = dictation.state.value.listening

    init {
        refresh()
        scope.launch { dictation.state.collect { refresh() } }
    }

    /** O botão do microfone: parado, liga (pede a permissão na primeira vez); ouvindo, para e entrega o texto. */
    fun toggle(blocked: Boolean) {
        if (listening) {
            dictation.stop()
            return
        }
        if (!speech.available || blocked) return
        permissionNotice = null
        if (!microphone.isGranted()) {
            askingPermission = true
            refresh()
            return
        }
        dictation.start()
    }

    /** A resposta do pedido de permissão do sistema: negada, diz por quê; concedida, liga a escuta. */
    fun permissionResult(granted: Boolean) {
        if (!askingPermission) return
        askingPermission = false
        if (!granted) {
            permissionNotice = speechErrorMessage(SpeechError.NotAllowed)
            refresh()
            return
        }
        dictation.start()
    }

    /** Desliga o microfone sem entregar o que foi ouvido (envio, tela fora de vista, fim do ViewModel). */
    fun cancel() {
        dictation.cancel()
        askingPermission = false
        refresh()
    }

    private fun refresh() {
        val heard = dictation.state.value
        val notice = permissionNotice ?: heard.error?.let(::speechErrorMessage)
        onVoice(VoiceUiState(speech.available, heard.listening, heard.heard, notice, askingPermission))
    }
}
