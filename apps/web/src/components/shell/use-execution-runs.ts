"use client";

import type { TaskCardDto } from "@repo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { REQUEST_STARTED_SIGNAL } from "@/lib/api/requests";
import { listTrackedTasks } from "@/lib/api/tasks";
import { executionRunsOf, EXECUTION_STATUS_FILTER } from "@/lib/tasks/execution-runs";
import { useOpenAgentRefresh } from "@/lib/tasks/use-open-agent-refresh";

/** De quanto em quanto tempo a gaveta se relê quando não há execução em andamento. */
export const EXECUTION_IDLE_POLL_MS = 30_000;

/**
 * As execuções de agente em andamento, lidas da lista de tarefas acompanhadas (executor agente, status em andamento).
 * Relê a cada 3 s enquanto houver alguma, que é o intervalo das listas. Parada, relê quando a janela volta ao foco,
 * logo depois de o próprio cliente abrir um pedido e a cada 30 s. Falha de leitura mantém o que já está à mostra.
 * Com `enabled` falso (a gaveta fora de cena) não lê; ao voltar, lê na hora.
 */
export function useExecutionRuns(enabled: boolean): TaskCardDto[] {
  const [runs, setRuns] = useState<TaskCardDto[]>([]);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const cards = await listTrackedTasks({ actor: "agent", status: EXECUTION_STATUS_FILTER });
      if (aliveRef.current) setRuns(executionRunsOf(cards));
    } catch {
      // A próxima batida tenta de novo; a gaveta segue com o que já mostra.
    }
  }, []);

  // Ao entrar em cena lê na hora.
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const busy = runs.length > 0;
  useOpenAgentRefresh(enabled && busy, refresh);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(REQUEST_STARTED_SIGNAL, onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(REQUEST_STARTED_SIGNAL, onFocus);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || busy) return;
    const timer = setInterval(() => void refresh(), EXECUTION_IDLE_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, busy, refresh]);

  return runs;
}
