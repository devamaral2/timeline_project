package app.braid.mobile.ui.taskdetail

import app.braid.mobile.domain.chat.ChatFailureCode
import app.braid.mobile.domain.chat.ChatRequestException
import app.braid.mobile.domain.markdown.youtubeVideoOf
import app.braid.mobile.domain.transcription.TranscriptionRepository
import app.braid.mobile.domain.transcription.TranscriptionText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** O "Adicionar vídeo" do detalhe da Leitura diária: o botão, ou o campo do link aberto, e o que ele avisa. */
data class AddVideoState(
    val open: Boolean = false,
    val link: String = "",
    val busy: Boolean = false,
    /** O aviso de link recusado ou de falha ao pedir, sob o campo. */
    val error: String? = null,
    /** O aviso de que o pedido foi gravado, sob o botão. */
    val notice: String? = null,
)

/**
 * "Adicionar vídeo" no detalhe da Leitura diária: abre um campo para o link e cria o mesmo pedido de transcrição do chat
 * e da extensão (spec #39). Link que não é de vídeo do YouTube (canal, playlist, busca) é recusado antes de chamar a API,
 * com o mesmo aviso que a API daria. Com o pedido gravado, [onRequested] relê a tarefa.
 */
class AddVideoForm(
    private val scope: CoroutineScope,
    private val transcription: TranscriptionRepository,
    private val onRequested: () -> Unit,
) {
    private val mutableState = MutableStateFlow(AddVideoState())
    val state: StateFlow<AddVideoState> = mutableState.asStateFlow()

    fun show() = mutableState.update { it.copy(open = true, notice = null) }

    fun hide() {
        if (mutableState.value.busy) return
        mutableState.update { AddVideoState(notice = it.notice) }
    }

    /** Digitar de novo tira o aviso de link recusado. */
    fun type(text: String) = mutableState.update { it.copy(link = text, error = null) }

    fun submit() {
        val current = mutableState.value
        if (current.busy) return
        val url = current.link.trim()
        if (youtubeVideoOf(url) == null) {
            mutableState.update { it.copy(error = TranscriptionText.INVALID_LINK) }
            return
        }
        mutableState.update { it.copy(busy = true, error = null) }
        scope.launch {
            try {
                val result = transcription.request(url)
                mutableState.value =
                    AddVideoState(notice = if (result.created) TranscriptionText.FORM_QUEUED else TranscriptionText.ALREADY_QUEUED)
                onRequested()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: ChatRequestException) {
                val refused = failure.failure == ChatFailureCode.InvalidInput
                mutableState.update {
                    it.copy(busy = false, error = if (refused) TranscriptionText.INVALID_LINK else TranscriptionText.FORM_FAILED)
                }
            } catch (failure: Exception) {
                mutableState.update { it.copy(busy = false, error = TranscriptionText.FORM_FAILED) }
            }
        }
    }
}
