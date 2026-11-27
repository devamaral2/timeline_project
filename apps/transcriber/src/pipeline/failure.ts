import { RequestFailure } from "../types";

const RULES: { code: RequestFailure["code"]; pattern: RegExp }[] = [
  { code: "too_large", pattern: /larger than max-filesize|too large/i },
  { code: "private", pattern: /private video|members-only|join this channel|sign in to confirm your age|login required/i },
  { code: "no_audio", pattern: /requested format is not available|no audio|does not have an audio/i },
  {
    code: "unavailable",
    pattern: /video unavailable|video is not available|not made this video available|has been removed|account.*terminated|copyright|blocked it|live event will begin|premieres in/i,
  },
];

/**
 * Reduz o que deu errado ao código fechado da API. A mensagem crua do yt-dlp fica só no log: ela nunca vai à API.
 * A falha que o serviço já decidiu (`RequestFailure`) passa como está.
 */
export function classifyFailure(cause: unknown): RequestFailure {
  if (cause instanceof RequestFailure) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  const rule = RULES.find(({ pattern }) => pattern.test(message));
  return new RequestFailure(rule?.code ?? "failed", message);
}
