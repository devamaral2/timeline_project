package app.braid.mobile.domain.transcription

import app.braid.mobile.domain.task.TaskActor
import java.text.Normalizer

/**
 * Os textos do pedido de transcrição (spec #39): os mesmos do web (`lib/transcription/texts.ts`), conferidos por
 * fixture gerada dele.
 */
object TranscriptionText {
    /** O que a linha de status do chat diz enquanto o pedido é gravado. */
    const val CHAT_PENDING = "Pedindo a transcrição"

    /** A resposta do chat quando o vídeo entrou na fila. */
    const val CHAT_QUEUED =
        "O vídeo entrou na fila de transcrição. O documento já está na Leitura diária de hoje e o texto chega quando a transcrição terminar."

    /** A resposta do chat quando o mesmo vídeo já esperava no dia. */
    const val CHAT_AGAIN = "Esse vídeo já estava na fila de transcrição. Nada foi duplicado."

    /** Link que não é de vídeo do YouTube (canal, playlist, busca), no chat e no campo do botão. */
    const val INVALID_LINK = "Esse link não é de um vídeo do YouTube."

    /** O aviso sob o botão "Adicionar vídeo" quando o vídeo entrou na fila. */
    const val FORM_QUEUED = "O vídeo entrou na fila de transcrição. O texto chega na Leitura diária quando a transcrição terminar."
    const val FORM_AGAIN = "Esse vídeo já estava na fila de transcrição. Nada foi duplicado."
    const val FORM_FAILED = "Não foi possível pedir a transcrição. Tente novamente."

    /** O nome da tarefa que a resposta do chat abre. */
    const val DAILY_READING = "Leitura diária"
}

private val DIACRITICS = Regex("\\p{M}+")
private val SPACES = Regex("[\\s\\p{Z}\\uFEFF]+")

private fun fold(text: String): String =
    Normalizer
        .normalize(text, Normalizer.Form.NFD)
        .replace(DIACRITICS, "")
        .lowercase()
        .replace(SPACES, " ")
        .trim()

/** A tarefa de pessoa "Leitura diária": "Leitura Diaria" e "leitura  diária" são a mesma, como no web e na API. */
fun isDailyReading(
    actor: TaskActor,
    name: String,
): Boolean = actor == TaskActor.Human && fold(name) == fold(TranscriptionText.DAILY_READING)
