const OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * O instante em ISO-8601 com o fuso do usuario (America/Sao_Paulo, UTC-03:00, sem horario de verao
 * desde 2019). O modelo calcula "ha uma hora" e "as 13h" melhor a partir de um ISO do que de uma data por extenso.
 */
export function isoNow(now: Date): string {
  return `${new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 19)}-03:00`;
}
