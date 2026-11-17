import { useCallback, useEffect, useState } from "react";
import type { RecurrenceDto } from "@repo/contracts";
import { ApiRequestError } from "@/lib/api/client-request";
import { getRecurrence } from "@/lib/api/recurrences";
import { type RecurrenceDraft, recurrenceDraftFromRule } from "./task-recurrence-draft";

/** `gone`: a ocorrência ainda aponta para uma série que a API não tem mais (apagada). */
export type RecurrenceLoadState = "idle" | "loading" | "ready" | "gone" | "error";

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.kind === "not_found";
}

/**
 * O estado da recorrência no formulário, fora do `TaskDraft`. Com `recurrenceId`
 * (uma ocorrência), lê a série com `getRecurrence` e o rascunho começa dela; sem
 * ele (criação ou tarefa avulso), `draft` é `null` até a pessoa definir a regra.
 * Quando a série some (apagada e a tarefa relida), o estado volta ao vazio.
 */
export function useRecurrenceDraft(recurrenceId: string | null) {
  const [series, setSeries] = useState<RecurrenceDto | null>(null);
  const [loadState, setLoadState] = useState<RecurrenceLoadState>("idle");
  const [draft, setDraft0] = useState<RecurrenceDraft | null>(null);
  const setDraft: typeof setDraft0 = (v) => { console.log("SETDRAFT", typeof v === "function" ? "fn" : JSON.stringify(v), new Error().stack?.split("\n").slice(2,4).join("|")); setDraft0(v); };
  console.log("HOOK", JSON.stringify(draft), recurrenceId);

  useEffect(() => {
    if (recurrenceId === null) {
      setSeries(null);
      setDraft(null);
      setLoadState("idle");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    getRecurrence(recurrenceId).then(
      (loaded) => {
        if (cancelled) return;
        setSeries(loaded);
        setDraft(recurrenceDraftFromRule(loaded));
        setLoadState("ready");
      },
      (error: unknown) => {
        if (!cancelled) setLoadState(isNotFound(error) ? "gone" : "error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [recurrenceId]);

  /**
   * Relê a série: depois de uma revisão velha, ou de apagar a série. O rascunho que a pessoa
   * digitou fica como está; se a série não existe mais, a linha diz isso.
   */
  const reloadSeries = useCallback(async () => {
    if (recurrenceId === null) return;
    try {
      setSeries(await getRecurrence(recurrenceId));
      setLoadState("ready");
    } catch (error) {
      if (isNotFound(error)) {
        setSeries(null);
        setLoadState("gone");
      }
      // Outra falha: fica a versão na tela; o Salvar seguinte avisa de novo.
    }
  }, [recurrenceId]);

  return { series, loadState, draft, setDraft, reloadSeries };
}

export type RecurrenceState = ReturnType<typeof useRecurrenceDraft>;
