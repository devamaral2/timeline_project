/** Traduz os codigos de erro da Web Speech API. `null` significa "nao mostre nada ao usuario". */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Permita o acesso ao microfone para gravar.";
    case "no-speech":
      return "Não ouvi nada. Tente de novo.";
    case "audio-capture":
      return "Nenhum microfone encontrado.";
    case "network":
      return "Sem conexão com o serviço de voz.";
    default:
      return "Não foi possível gravar o áudio.";
  }
}
