"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/authed-fetch";
import type { AiProcessDto, AiProcessEditEntityType } from "@/lib/api/contracts";
import { type AiProcessEditApi, aiProcess, isProcessTerminal } from "./ai-process";

export type EntityAiEditPhase = "idle" | "sending" | "running" | "done" | "failed";

interface Options {
  userId: string;
  entityType: AiProcessEditEntityType;
  entityId: string;
  /** Chamado quando o processo terminou e algo mudou: a tela recarrega a entidade. */
  onEdited: () => void;
  api?: AiProcessEditApi;
  pollMs?: number;
}

const TIMEOUT_MS = 180_000;
const POLL_FAILURES = 5;

const ERROR_TEXTS = {
  forbidden: "Você não tem permissão para editar isto.",
  invalid: "Não consegui ler esse pedido. Tente escrever de outro jeito.",
  unavailable: "A IA está indisponível agora. Tente de novo em instantes.",
  lost: "Perdi a conexão antes da resposta. Confira se a mudança foi feita antes de repetir.",
  timeout: "O pedido demorou demais. Confira se a mudança foi feita antes de repetir.",
  generic: "Algo deu errado. Tente de novo.",
} as const;

function startFailureText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return ERROR_TEXTS.forbidden;
    if (error.status === 400) return ERROR_TEXTS.invalid;
    if (error.status === 404 || error.status === 503) return ERROR_TEXTS.unavailable;
  }
  return ERROR_TEXTS.generic;
}

/**
 * A conversa de edicao de uma entidade (ADR 006): envia o pedido com o tipo e o id da entidade da tela e
 * acompanha o processo ate o fim. Uma edicao por vez; ao terminar com sucesso a tela e avisada para recarregar.
 */
export function useEntityAiEdit({ userId, entityType, entityId, onEdited, api = aiProcess, pollMs = 1000 }: Options) {
  const [phase, setPhase] = useState<EntityAiEditPhase>("idle");
  const [process, setProcess] = useState<AiProcessDto | null>(null);
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
    setProcess(null);
    setPhase("sending");
    const fail = (message: string) => {
      busy.current = false;
      if (disposed.current) return;
      setError(message);
      setPhase("failed");
    };
    let processId: string;
    try {
      ({ processId } = await api.startEdit({ userId, text: trimmed, entityType, entityId }));
    } catch (cause) {
      fail(startFailureText(cause));
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
        const view = await api.get(processId);
        failures = 0;
        if (disposed.current) { busy.current = false; return true; }
        setProcess(view);
        if (isProcessTerminal(view)) {
          busy.current = false;
          const changed = view.status === "completed" && view.entities.length > 0;
          setPhase(view.status === "completed" ? "done" : "failed");
          if (view.status === "failed") setError(view.message ?? ERROR_TEXTS.generic);
          if (changed) onEditedRef.current();
          return true;
        }
      } catch {
        failures += 1;
        if (failures >= POLL_FAILURES) { fail(ERROR_TEXTS.lost); return true; }
      }
      if (Date.now() - startedAt > TIMEOUT_MS) { fail(ERROR_TEXTS.timeout); return true; }
    }
  }, [api, userId, entityType, entityId, pollMs]);

  const dismiss = useCallback(() => {
    if (busy.current) return;
    setPhase("idle");
    setProcess(null);
    setError(null);
  }, []);

  return { phase, process, error, submit, dismiss, busy: phase === "sending" || phase === "running" };
}
