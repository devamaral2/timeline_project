const OFFSET_MS = 3 * 60 * 60 * 1000;

/** Fuso unico do produto: os textos de "hoje" e "agora" dos agentes saem dele. */
export const TIME_ZONE = "America/Sao_Paulo";

/** A data e a hora por extenso, no fuso do usuario (entra no prompt dos agentes). */
export function formatNow(now: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, dateStyle: "full", timeStyle: "short" }).format(now);
}

/**
 * O instante em ISO-8601 com o fuso do usuario (America/Sao_Paulo, UTC-03:00, sem horario de verao
 * desde 2019). O modelo calcula "ha uma hora" e "as 13h" melhor a partir de um ISO do que de uma data por extenso.
 */
export function isoNow(now: Date): string {
  return `${new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 19)}-03:00`;
}
