"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestDto, RequestEntityDto } from "@repo/contracts";
import { ApiRequestError } from "@/lib/api/client-request";
import { operationId } from "@/lib/api/operation-id";
import { cancelRequest, getRequest, listRequests, startVoiceRequest } from "@/lib/api/requests";
import { isOpenRequest } from "@/lib/tasks/agent-request-model";
import { useSessionState } from "@/lib/session/use-session";

export interface VoiceJob {
  /** Id de mensagem estável (`clientMessageId`), guardado antes do envio: reenviar com ele não abre outro pedido. */
  id: string;
  /** O pedido aceito pela API, quando a resposta do envio chegou. */
  requestId?: string;
  transcript: string;
  status: "pending" | "error";
  error?: string;
  progress?: string;
  cancelling?: boolean;
}

/** O que ficou no navegador antes deste formato: `jobId` era o id de um job da API antiga, que a nova não conhece. */
type StoredVoiceJob = VoiceJob & { jobId?: string };

const CREATION_FAILED = "Não foi possível criar a tarefa.";

/** Lê o outbox guardado. Um item do formato antigo não tem como ser acompanhado: vira erro, e "Tentar de novo" decide. */
function restore(stored: StoredVoiceJob[]): VoiceJob[] {
  return stored.map(({ jobId, ...item }): VoiceJob => jobId && !item.requestId
    ? { ...item, status: "error", error: CREATION_FAILED }
    : item);
}

/** A tarefa que o pedido criou, lido das entidades dele. */
function createdTaskOf(request: RequestDto): RequestEntityDto | undefined {
  return request.entities.find((entity) => entity.kind === "task" && entity.operation === "create");
}

export function useVoiceTaskQueue({ onCreated }: { onCreated: (task: RequestEntityDto) => void }) {
  const { user } = useSessionState();
  const userId = user?.userId;
  const [jobs, setJobs] = useState<VoiceJob[]>([]);
  const jobsRef = useRef<VoiceJob[]>([]);
  const runningRef = useRef(false);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onCreatedRef = useRef(onCreated);
  const key = userId ? `voice-jobs:${userId}` : null;
  onCreatedRef.current = onCreated;

  const commit = useCallback((next: VoiceJob[]) => {
    jobsRef.current = next;
    setJobs(next);
    try {
      if (key) localStorage.setItem(key, JSON.stringify(next));
    } catch { /* Os pedidos aceitos continuam na lista do servidor. */ }
  }, [key]);

  // Ordem de captura preservada: um pedido por vez. Pedido aceito só é lido; envio sem resposta é refeito com o
  // mesmo id, e a API devolve o pedido que já aceitou.
  const drain = useCallback(async function drainQueue() {
    if (!activeRef.current || runningRef.current) return;
    const generation = generationRef.current;
    const job = jobsRef.current.find((item) => item.status === "pending");
    if (!job) return;
    runningRef.current = true;
    let terminal = false;
    try {
      if (!job.requestId) {
        const requestId = await startVoiceRequest({ transcript: job.transcript, clientMessageId: job.id });
        if (!activeRef.current || generationRef.current !== generation) return;
        commit(jobsRef.current.map((item) => item.id !== job.id ? item : { ...item, requestId }));
      } else {
        const request = job.cancelling ? await cancelRequest(job.requestId) : await getRequest(job.requestId);
        if (!activeRef.current || generationRef.current !== generation) return;
        const created = request.status === "done" ? createdTaskOf(request) : undefined;
        if (isOpenRequest(request.status)) {
          commit(jobsRef.current.map((item) => item.id !== job.id ? item : { ...item, progress: request.progress }));
        } else if (created) {
          commit(jobsRef.current.filter((item) => item.id !== job.id));
          onCreatedRef.current(created);
        } else {
          terminal = true;
          const error = request.status === "cancel" ? "Pedido cancelado." : request.message ?? CREATION_FAILED;
          commit(jobsRef.current.map((item) => item.id !== job.id ? item : { ...item, status: "error", error, cancelling: false }));
        }
      }
    } catch (error) {
      if (!activeRef.current || generationRef.current !== generation) return;
      // Recusa da API antes de aceitar (dado inválido, sem permissão, sem usuário) não se refaz sozinha.
      terminal = !job.requestId && error instanceof ApiRequestError
        && ["invalid_input", "forbidden", "not_found"].includes(error.kind);
      commit(jobsRef.current.map((item) => item.id !== job.id ? item : {
        ...item, status: terminal ? "error" : "pending",
        error: terminal ? "Não entendi o que você falou." : undefined,
        progress: "Reconectando — seu pedido continua salvo.",
      }));
    } finally {
      if (generationRef.current === generation) runningRef.current = false;
    }
    if (activeRef.current && jobsRef.current.some((item) => item.status === "pending")) {
      timerRef.current = setTimeout(() => void drainQueue(), terminal ? 0 : 1500);
    }
  }, [commit]);

  useEffect(() => {
    if (!key) { commit([]); return; }
    let cancelled = false;
    generationRef.current++;
    activeRef.current = true;
    try {
      commit(restore(JSON.parse(localStorage.getItem(key) ?? "[]") as StoredVoiceJob[]));
    } catch { commit([]); }
    void drain();
    void listRequests(50).then((list) => {
      if (cancelled) return;
      const recovered = list
        .filter((request) => request.route === "voice" && isOpenRequest(request.status))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        // Já na fila: pelo id do pedido, ou um envio sem resposta com o mesmo texto (será refeito com o mesmo id).
        .filter((request) => !jobsRef.current.some((item) => item.requestId === request.id
          || (!item.requestId && item.transcript === request.text)))
        .map((request): VoiceJob => ({
          id: request.id, requestId: request.id, transcript: request.text ?? "", status: "pending", progress: request.progress,
        }));
      if (recovered.length) {
        commit([...jobsRef.current, ...recovered]);
        void drain();
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
      activeRef.current = false;
      generationRef.current++;
      runningRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, [key, commit, drain]);

  const enqueue = useCallback((transcript: string) => {
    if (!userId) return;
    commit([...jobsRef.current, { id: operationId(), transcript, status: "pending" }]);
    void drain();
  }, [commit, drain, userId]);

  const retry = useCallback((id: string) => {
    // Um novo pedido só depois de uma falha terminal explícita.
    commit(jobsRef.current.map((item) => item.id === id && item.status === "error"
      ? { id: operationId(), transcript: item.transcript, status: "pending" } : item));
    void drain();
  }, [commit, drain]);

  const dismiss = useCallback((id: string) => {
    commit(jobsRef.current.filter((item) => item.id !== id || item.status === "pending"));
  }, [commit]);

  const cancel = useCallback((id: string) => {
    commit(jobsRef.current.map((item) => item.id === id && item.status === "pending"
      ? { ...item, cancelling: true, progress: "Cancelando" } : item));
    clearTimeout(timerRef.current);
    void drain();
  }, [commit, drain]);

  return { jobs, enqueue, retry, dismiss, cancel };
}
