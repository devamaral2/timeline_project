/**
 * O job do pedido de transcrição (ADR 0013). O worker interno da API só pega
 * os tipos que tem handler, e este não tem: quem o reserva é o serviço local,
 * por HTTP, com lease.
 */
export const TRANSCRIPTION_JOB = "video-transcription";

/** O que o pedido guarda em `tasks.data`: o suficiente para reconhecê-lo e para a entrega achar o documento. */
export interface TranscriptionRequestData {
  /** O endereço canônico do vídeo (`https://www.youtube.com/watch?v=ID`). */
  url: string;
  /** O dia do pedido (`AAAA-MM-DD` no fuso das tarefas): é a Leitura diária dele que a entrega devolve para a fazer. */
  day: string;
  videoId: string;
  readingTaskId: string;
  artifactId: string;
}

/** Um pedido que ainda espera o serviço local ou está sendo formatado. */
export interface OpenTranscriptionRequest {
  requestId: string;
  readingTaskId: string;
  artifactId: string;
}

/**
 * Persistência do pedido de transcrição que o lote de entidades não cobre: a
 * relação entre tarefas e o job. `record` roda na transação do escritor em lote
 * (`EntityBatch.afterWrite`), para que o pedido, o documento, a ligação com a
 * leitura e o job existam se e somente se existem juntos.
 */
export interface TranscriptionRequests {
  /** O pedido do mesmo vídeo, no mesmo dia, que ainda está em `awaiting_transcription` ou `running`. */
  findOpen(userId: string, url: string, day: string): Promise<OpenTranscriptionRequest | undefined>;
  /** A relação do pedido com a Leitura diária (`generates` quando ele a criou, `updates` quando a alterou) e o job. */
  record(
    tx: unknown,
    input: { requestId: string; userId: string; readingTaskId: string; relation: "generates" | "updates" },
  ): Promise<void>;
}
