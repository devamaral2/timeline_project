package app.braid.mobile.domain.transcription

/** O pedido de transcrição gravado (`TranscriptionRequestResult`). */
data class TranscriptionRequest(
    /** A tarefa de agente `save_content_with_transcription` que espera o serviço local. */
    val requestId: String,
    /** A Leitura diária do dia do pedido. */
    val taskId: String,
    /** O artefato do vídeo, com "Transcrição na fila" até a transcrição chegar. */
    val artifactId: String,
    /** `false` quando o mesmo vídeo já esperava ou rodava no dia: devolve o pedido que existia, sem gravar nada. */
    val created: Boolean,
)

interface TranscriptionRepository {
    /**
     * Pede a transcrição de um vídeo do YouTube. Falha como [app.braid.mobile.domain.chat.ChatRequestException]: o link que
     * a API recusa (400) vem como `InvalidInput`.
     */
    suspend fun request(url: String): TranscriptionRequest
}
