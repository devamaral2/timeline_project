"use client";

import { isCancelledAgentStatus, isSuccessAgentStatus } from "@repo/contracts";
import type { RequestDto, RequestEditEntityType } from "@repo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { modelSelectionForRequest } from "@/lib/agent-chat/model-selection-store";
import { agentFailureText, startFailureCode } from "@/lib/agent-chat/use-agent-chat";
import { getRequest, startEditRequest } from "@/lib/api/requests";
import { AGENT_REQUEST_POLL_MS, isOpenRequest } from "@/lib/tasks/agent-request-model";

export type EntityAiEditPhase = "idle" | "sending" | "running" | "done" | "failed";

interface Options {
  userId: string;
  entityType: RequestEditEntityType;
  entityId: string;
  /** Chamado quando o pedido terminou e mudou algo: a tela recarrega a entidade. */
  onEdited: () => void;
  pollMs?: number;
}

const TIMEOUT_MS = 180_000;
const POLL_FAILURES = 5;

const LOST_TEXT = "Perdi a conexão antes da resposta. Confira se a mudança foi feita antes de repetir.";
const TIMEOUT_TEXT = "O pedido demorou demais. Confira se a mudança foi feita antes de repetir.";

/**
 * A edição da entidade aberta: abre um pedido de edição com o tipo e o id da entidade da tela
 * (`POST /api/requests/edit`) e acompanha o pedido com `getRequest` até o estado final. Uma edição por vez.
 * O pedido leva a escolha de modelo que o campo mostra (o agente de edição roda com ela); sem o modo modelo neste
 * ambiente, vai sem escolha. O texto de falha vem do código do pedido, como no chat.
 */
export function useEntityAiEdit({ userId, entityType, entityId, onEdited, pollMs = AGENT_REQUEST_POLL_MS }: Options) {
  const [phase, setPhase] = useState<EntityAiEditPhase>("idle");
  const [request, setRequest] = useState<RequestDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disposed = useRef(false);
  const busy = useRef(false);
  const onEditedRef = useRef(onEdited);

  useEffect(() => {
    onEditedRef.current = onEdited;
  }, [onEdited]);
  useEffect(() => {
    disposed.current = false;
    return () => { disposed.current = true; };
  }, []);

  const submit = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed || busy.current) return false;
    busy.current = true;
    setError(null);
    setRequest(null);
    setPhase("sending");
    const fail = (message: string) => {
      busy.current = false;
      if (disposed.current) return;
      setError(message);
      setPhase("failed");
    };

    let requestId: string;
    try {
      const model = await modelSelectionForRequest();
      requestId = await startEditRequest({ userId, text: trimmed, entityType, entityId, ...(model ? { model } : {}) });
    } catch (cause) {
      fail(agentFailureText(startFailureCode(cause)));
      return false;
    }
    if (disposed.current) { busy.current = false; return true; }
    setPhase("running");

    const startedAt = Date.now();
    let failures = 0;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      if (disposed.current) { busy.current = false; return true; }
      try {
        const view = await getRequest(requestId);
        failures = 0;
        if (disposed.current) { busy.current = false; return true; }
        setRequest(view);
        if (!isOpenRequest(view.status)) {
          busy.current = false;
          if (isSuccessAgentStatus(view.status)) {
            setPhase("done");
            if (view.entities.length > 0) onEditedRef.current();
          } else {
            setError(agentFailureText(view.errorCode ?? (isCancelledAgentStatus(view.status) ? "cancelled" : "internal")));
            setPhase("failed");
          }
          return true;
        }
      } catch {
        failures += 1;
        if (failures >= POLL_FAILURES) { fail(LOST_TEXT); return true; }
      }
      if (Date.now() - startedAt > TIMEOUT_MS) { fail(TIMEOUT_TEXT); return true; }
    }
  }, [userId, entityType, entityId, pollMs]);

  const dismiss = useCallback(() => {
    if (busy.current) return;
    setPhase("idle");
    setRequest(null);
    setError(null);
  }, []);

  return { phase, request, error, submit, dismiss, busy: phase === "sending" || phase === "running" };
}
