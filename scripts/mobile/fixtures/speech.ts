/**
 * Fixtures da voz no chat: as saídas de `isStopSpeech` (a fala que encerra o laço de escuta) e de `speechErrorMessage`
 * (os textos de erro de fala) para as mesmas entradas que o app Android recebe.
 *
 * O `css-stub` vem primeiro: `hub-commands` importa módulos que o Node não lê sem ele.
 */
import "../css-stub";
import { isStopSpeech } from "../../../apps/web/src/components/hub/hub-commands";
import { speechErrorMessage } from "../../../apps/web/src/lib/speech/speech-error-messages";

const STOP_PHRASES = [
  "para",
  "Para.",
  "pode parar",
  "Pode parar!",
  "parar de ouvir",
  "para de ouvir por favor",
  "por favor, pare",
  "Chega!",
  "chega",
  "encerrar",
  "Encerra.",
  "cancelar",
  "cancela",
  "stop",
  "STOP",
  "pare de escutar",
  "  chega   ",
  "para amanhã",
  "o que tenho para hoje",
  "parar o treino de quinta",
  "parar o carro",
  "chega de ouvir música",
  "",
  "criar tarefa",
];

// Os códigos da Web Speech API e os que o Android devolve, já traduzidos para eles.
const ERROR_CODES = ["aborted", "not-allowed", "service-not-allowed", "no-speech", "audio-capture", "network", "unknown", "language-not-supported"];

export function speechFixtures(): Record<string, unknown> {
  return {
    "speech-functions": {
      isStopSpeech: STOP_PHRASES.map((text) => ({ args: [text], result: isStopSpeech(text) })),
      speechErrorMessage: ERROR_CODES.map((code) => ({ args: [code], result: speechErrorMessage(code) })),
    },
  };
}
