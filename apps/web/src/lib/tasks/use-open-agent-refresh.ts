"use client";

import { useEffect, useRef } from "react";
import { AGENT_REQUEST_POLL_MS } from "./agent-request-model";

/**
 * Relê uma lista a cada `AGENT_REQUEST_POLL_MS` enquanto `enabled` for verdadeiro (há evento de agente em aberto
 * nela). A releitura troca os dados; quem chama decide que ela não volta ao estado de carregando. Para quando
 * `enabled` vira falso ou a tela é desmontada. Uma releitura ainda em curso pula a batida seguinte.
 */
export function useOpenAgentRefresh(enabled: boolean, refresh: () => void | Promise<void>): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      // A própria releitura trata a sua falha: a lista mantém o que já mostra e a próxima batida tenta de novo.
      void Promise.resolve()
        .then(() => refreshRef.current())
        .catch(() => {})
        .finally(() => { busy = false; });
    }, AGENT_REQUEST_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}
