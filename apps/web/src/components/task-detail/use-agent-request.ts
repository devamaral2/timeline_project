"use client";

import type { RequestDto } from "@repo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api/client-request";
import { getRequest } from "@/lib/api/requests";
import { AGENT_REQUEST_POLL_MS, isOpenRequest } from "@/lib/tasks/agent-request-model";

export { AGENT_REQUEST_POLL_MS };

export type AgentRequestLoad = "loading" | "ready" | "missing" | "error";

/**
 * Lê o pedido da tarefa de agente (o mesmo id) e, enquanto ele estiver em aberto, relê o pedido a cada intervalo e
 * chama `onTick`, que relê a tarefa (a conclusão e a data vêm dele). Para no estado final, depois de uma última
 * releitura da tarefa. Falha numa releitura mantém a última versão na tela; a próxima tenta de novo.
 * `reload` relê o pedido a pedido de quem usa (o puxão na tela): a falha mantém o que está na tela e volta para
 * quem pediu, que avisa.
 */
export function useAgentRequest(
  requestId: string,
  onTick: () => Promise<void>,
): { request: RequestDto | null; load: AgentRequestLoad; applyRequest: (view: RequestDto) => void; reload: () => Promise<void> } {
  const [request, setRequest] = useState<RequestDto | null>(null);
  const [load, setLoad] = useState<AgentRequestLoad>("loading");
  const tickRef = useRef(onTick);

  useEffect(() => {
    tickRef.current = onTick;
  });

  useEffect(() => {
    let cancelled = false;
    setLoad("loading");
    getRequest(requestId).then(
      (loaded) => {
        if (cancelled) return;
        setRequest(loaded);
        setLoad("ready");
      },
      (error: unknown) => {
        if (!cancelled) setLoad(isMissing(error) ? "missing" : "error");
      },
    );
    return () => { cancelled = true; };
  }, [requestId]);

  const open = request !== null && isOpenRequest(request.status);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void (async () => {
        try {
          const next = await getRequest(requestId);
          if (cancelled) return;
          setRequest(next);
          await tickRef.current();
        } catch {
          // Falha numa releitura: a tela mantém o que já mostra e a próxima batida tenta de novo.
        } finally {
          busy = false;
        }
      })();
    }, AGENT_REQUEST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, requestId]);

  const reload = useCallback(async () => {
    setRequest(await getRequest(requestId));
    setLoad("ready");
  }, [requestId]);

  return { request, load, applyRequest: setRequest, reload };
}

/** O pedido inexistente responde 404 e o de outro usuário 403: a tela diz só que não há pedido. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "not_found" || error.kind === "forbidden");
}
