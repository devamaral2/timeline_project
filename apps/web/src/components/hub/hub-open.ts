/** Uma janela livre do dia, como a agenda a entrega ao chat do Hermes. */
export interface FreeWindow {
  dayKey: string;
  startMs: number;
  endMs: number;
  minutes: number;
  /** A janela vai até o fim do dia, que se escreve “24:00”. */
  endsAtMidnight: boolean;
}

/** O que acompanha o pedido de abrir o painel do Hermes. */
export interface HubOpenDetail {
  freeWindow?: FreeWindow;
}

/**
 * O pedido de abrir o painel "Buscar e criar" vindo de uma tela (tocar numa
 * janela livre da agenda, por exemplo). Quem escuta é o shell, dono do painel.
 */
export const hubOpenEvent = "braid:hub-open";

export function requestHubOpen(detail: HubOpenDetail = {}) {
  window.dispatchEvent(new CustomEvent<HubOpenDetail>(hubOpenEvent, { detail }));
}
