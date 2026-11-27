import { useEffect, useRef } from "react";

/**
 * Puxar a tela para baixo relê os dados dela. O gesto e o indicador moram no
 * shell (`components/shell/pull-to-refresh.tsx`), mas quem sabe reler é a tela:
 * ela entrega aqui a função que relê em silêncio (sem voltar ao estado de
 * carregando) e só termina quando a leitura acaba. Tela que não entrega nada
 * (formulário, configuração) não tem o gesto: recarregar ali jogaria fora o
 * que foi digitado.
 */
export type PullRefresh = () => void | Promise<void>;

/** Quanto o indicador precisa descer para soltar valer uma recarga. */
export const PULL_THRESHOLD = 64;
/** Até onde o indicador desce, por mais que o dedo continue. */
export const PULL_LIMIT = 96;
/** Onde o indicador repousa enquanto a tela relê. */
export const PULL_REST = 56;
/** O indicador anda menos que o dedo: a resistência de quem puxa uma mola. */
const PULL_RESISTANCE = 0.5;

/** Quanto o indicador desce para um dedo que desceu `fingerTravel`. */
export function pullTravel(fingerTravel: number): number {
  return Math.min(PULL_LIMIT, Math.max(0, fingerTravel * PULL_RESISTANCE));
}

const handlers: PullRefresh[] = [];

/**
 * A tela publica a releitura dela enquanto está montada e `enabled` vale. A
 * função pode mudar a cada desenho: vale sempre a mais recente.
 */
export function usePullRefresh(refresh: PullRefresh, enabled = true): void {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    const handler: PullRefresh = () => latest.current();
    handlers.push(handler);
    return () => {
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    };
  }, [enabled]);
}

/** A releitura da tela à vista; `undefined` quando ela não tem o gesto. */
export function currentPullRefresh(): PullRefresh | undefined {
  return handlers[handlers.length - 1];
}
