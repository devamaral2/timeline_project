/**
 * Irmao de apps/web/src/lib/speech/speech-error-messages.ts. Os codigos
 * `not-allowed`, `no-speech`, `audio-capture`, `network` e `aborted` sao os
 * mesmos ali definidos pela Web Speech API; o expo-speech-recognition os
 * reaproveita e acrescenta alguns proprios do motor nativo do aparelho.
 *
 * `null` significa "nao mostre nada ao usuario".
 */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Permita o acesso ao microfone para gravar.";
    case "no-speech":
    case "speech-timeout":
      return "Não ouvi nada. Tente de novo.";
    case "audio-capture":
      return "Nenhum microfone encontrado.";
    case "network":
      return "Sem conexão com o serviço de voz.";
    case "language-not-supported":
      return "Este aparelho não reconhece voz em português.";
    case "busy":
      return "O reconhecimento de voz já está em uso.";
    default:
      return "Não foi possível gravar o áudio.";
  }
}
