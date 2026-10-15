"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/authed-fetch";
import { aiJobs, isJobPending, operationId } from "@/lib/ai-jobs/ai-jobs";
import { useSessionState } from "@/lib/session/use-session";

export interface VoiceJob {
  /** Stable requestId, retained if the submission response is lost. */
  id: string;
  jobId?: string;
  transcript: string;
  status: "pending" | "error";
  error?: string;
  progress?: string;
  cancelling?: boolean;
}

export function useVoiceEventQueue({ onAllDone }: { onAllDone: () => void }) {
  const { user } = useSessionState();
  const userId = user?.userId;
  const [jobs, setJobs] = useState<VoiceJob[]>([]);
  const jobsRef = useRef<VoiceJob[]>([]);
  const runningRef = useRef(false);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onAllDoneRef = useRef(onAllDone);
  const key = userId ? `voice-jobs:${userId}` : null;
  onAllDoneRef.current = onAllDone;

  const commit = useCallback((next: VoiceJob[]) => {
    jobsRef.current = next;
    setJobs(next);
    try {
      if (key) localStorage.setItem(key, JSON.stringify(next));
    } catch { /* Accepted jobs remain recoverable by server-side list. */ }
  }, [key]);

  // Preserve capture order. Accepted work is only queried; ambiguous
  // submission responses are retried with the same id, not a new operation.
  const drain = useCallback(async function drainQueue() {
    if (!activeRef.current || runningRef.current) return;
    const generation = generationRef.current;
    const job = jobsRef.current.find((item) => item.status === "pending");
    if (!job) return;
    runningRef.current = true;
    let terminal = false;
    try {
      const result = job.jobId
        ? await (job.cancelling ? aiJobs.cancel(job.jobId) : aiJobs.get(job.jobId))
        : await aiJobs.voice(job.transcript, job.id);
      if (!activeRef.current || generationRef.current !== generation) return;
      terminal = !isJobPending(result);
      if (result.status === "succeeded") {
        commit(jobsRef.current.filter((item) => item.id !== job.id));
        onAllDoneRef.current();
      } else {
        commit(jobsRef.current.map((item) => item.id !== job.id ? item : {
          ...item, jobId: result.id, progress: result.progress,
          status: terminal ? "error" : "pending",
          error: terminal ? (result.status === "cancelled" ? "Pedido cancelado." : "Não foi possível criar o evento.") : undefined,
        }));
      }
    } catch (error) {
      if (!activeRef.current || generationRef.current !== generation) return;
      terminal = !job.jobId && error instanceof ApiError && [400, 403, 404, 422].includes(error.status);
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
      commit(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch { commit([]); }
    void drain();
    void aiJobs.list().then((list) => {
      if (cancelled) return;
      const recovered = list.filter((job) => job.kind === "transcript-event" && isJobPending(job))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .filter((job) => !jobsRef.current.some((item) => item.jobId === job.id || item.id === job.request?.clientMessageId))
        .map((job): VoiceJob => ({
          id: job.request?.clientMessageId ?? job.id, jobId: job.id,
          transcript: job.request?.text ?? "", status: "pending", progress: job.progress,
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
    // A new operation is safe only after an explicitly terminal failure.
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
