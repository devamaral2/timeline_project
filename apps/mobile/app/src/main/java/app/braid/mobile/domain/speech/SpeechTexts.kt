package app.braid.mobile.domain.speech

import java.text.Normalizer
import java.util.Locale

/** Traduz os erros de fala para o texto da tela; `null` é "não mostre nada" (o web faz o mesmo com `aborted`). */
fun speechErrorMessage(error: SpeechError): String? =
    when (error) {
        SpeechError.Aborted -> null
        SpeechError.NotAllowed -> "Permita o acesso ao microfone para gravar."
        SpeechError.NoSpeech -> "Não ouvi nada. Tente de novo."
        SpeechError.AudioCapture -> "Nenhum microfone encontrado."
        SpeechError.Network -> "Sem conexão com o serviço de voz."
        SpeechError.Unknown -> "Não foi possível gravar o áudio."
    }

private val DIACRITICS = Regex("\\p{InCombiningDiacriticalMarks}")
private val NOT_WORDS = Regex("[^\\p{L}\\p{N}\\s]")
private val SPACES = Regex("\\s+")
private val STOP_SPEECH =
    Regex("^(pode |por favor )?(para|parar|pare|chega|encerrar|encerra|cancelar|cancela|stop)( de (ouvir|escutar))?( por favor)?$")

/** "Pode parar!", "chega" e "para de ouvir por favor" encerram o laço de escuta; "parar o carro" não. */
fun isStopSpeech(transcript: String): Boolean {
    val folded =
        Normalizer
            .normalize(transcript, Normalizer.Form.NFD)
            .replace(DIACRITICS, "")
            .lowercase(Locale.forLanguageTag("pt-BR"))
    return STOP_SPEECH.matches(folded.replace(NOT_WORDS, " ").replace(SPACES, " ").trim())
}
