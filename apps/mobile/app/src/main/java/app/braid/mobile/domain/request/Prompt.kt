package app.braid.mobile.domain.request

/** O limite do texto de um pedido ao assistente, igual em todo campo que o envia (chat, tarefa de agente, edição por IA). */
const val PROMPT_MAX_LENGTH = 4000

/** O campo com o que o microfone ouviu acrescentado ao que já estava escrito, dentro do limite. */
fun appendTranscript(
    current: String,
    transcript: String,
): String = (if (current.isNotEmpty()) "$current $transcript" else transcript).take(PROMPT_MAX_LENGTH)
