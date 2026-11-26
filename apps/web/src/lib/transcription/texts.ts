/**
 * Os textos do pedido de transcrição (spec #39), num lugar só: o chat e o botão "Adicionar vídeo" do web os usam, e o
 * app Android os confere contra a fixture gerada daqui (`scripts/mobile/fixtures/transcription.ts`).
 */
export const TRANSCRIPTION_TEXTS = {
  /** O que a linha de status do chat diz enquanto o pedido é gravado. */
  chatPending: "Pedindo a transcrição",
  /** A resposta do chat quando o vídeo entrou na fila. */
  chatQueued:
    "O vídeo entrou na fila de transcrição. O documento já está na Leitura diária de hoje e o texto chega quando a transcrição terminar.",
  /** Quando o mesmo vídeo já esperava no dia: a resposta do chat e o aviso sob o botão "Adicionar vídeo". */
  alreadyQueued: "Esse vídeo já estava na fila de transcrição. Nada foi duplicado.",
  /** Link que não é de vídeo do YouTube (canal, playlist, busca), no chat e no campo do botão. */
  invalidLink: "Esse link não é de um vídeo do YouTube.",
  /** O aviso sob o botão "Adicionar vídeo" quando o vídeo entrou na fila. */
  formQueued: "O vídeo entrou na fila de transcrição. O texto chega na Leitura diária quando a transcrição terminar.",
  formFailed: "Não foi possível pedir a transcrição. Tente novamente.",
  /** O nome da tarefa que a resposta do chat abre. */
  dailyReading: "Leitura diária",
} as const;
