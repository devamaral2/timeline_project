import { RequestFailure } from "../types";

/** Um vídeo mais longo que o teto não é baixado. Sem duração (transmissão ao vivo) também não há o que transcrever. */
export function checkDuration(durationSeconds: number, maxSeconds: number): RequestFailure | null {
  if (!(durationSeconds > 0)) return new RequestFailure("unavailable", "o vídeo não tem duração (transmissão ao vivo?)");
  if (durationSeconds > maxSeconds) {
    return new RequestFailure("too_large", `duração de ${Math.round(durationSeconds)} s acima do teto de ${maxSeconds} s`);
  }
  return null;
}

/** O áudio acima do teto é recusado. `null` é o tamanho que ainda não se sabe: passa, e a baixada o limita. */
export function checkAudioSize(bytes: number | null, maxBytes: number): RequestFailure | null {
  if (bytes !== null && bytes > maxBytes) {
    return new RequestFailure("too_large", `áudio de ${bytes} bytes acima do teto de ${maxBytes} bytes`);
  }
  return null;
}
