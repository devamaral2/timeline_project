/**
 * `POST /api/tasks/transcription-requests`: o link de um vídeo do YouTube que a
 * pessoa quer ler como texto. O pedido nasce na hora, na fila do serviço local
 * de transcrição; o documento do vídeo entra na Leitura diária do dia.
 */
export interface TranscriptionRequestInput {
  /** O endereço do vídeo: `watch?v=`, `youtu.be/`, `shorts/`, `embed/` ou `live/`. */
  url: string;
}

export interface TranscriptionRequestResult {
  /** A tarefa de agente `save_content_with_transcription` que espera o serviço local. */
  requestId: string;
  /** A Leitura diária do dia do pedido. */
  taskId: string;
  /** O documento do vídeo, com "Transcrição na fila" até a transcrição chegar. */
  artifactId: string;
  /** `false` quando o mesmo vídeo já esperava ou rodava no dia: devolve o pedido que existia, sem gravar nada. */
  created: boolean;
}
