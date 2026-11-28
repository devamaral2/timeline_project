import { TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES } from "@repo/contracts/device-key";

/**
 * O markdown de uma pagina longa nao cabe nos 100 kB padrao do Express. A folga
 * sobre o teto do markdown cobre os escapes do JSON.
 */
export const DAILY_READING_BODY_LIMIT_BYTES = 1024 * 1024;

/** O teto da API e o da maior rota; cada rota pode ter o seu proprio limite. */
export const API_BODY_LIMIT_BYTES = Math.max(DAILY_READING_BODY_LIMIT_BYTES, TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES);
