import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/api/client";

export interface VoiceJob {
  id: string;
  transcript: string;
  status: "pending" | "error";
  error?: string;
}

interface UseVoiceEventQueueOptions {
  onAllDone: () => void;
}

interface UseVoiceEventQueueResult {
  jobs: VoiceJob[];
  enqueue: (transcript: string) => void;
  retry: (jobId: string) => void;
  dismiss: (jobId: string) => void;
}

let jobCounter = 0;

/**
 * Irmao de apps/web/src/lib/voice-events/use-voice-event-queue.ts — mesma
 * fila, mesma regra de um job por vez (em paralelo, um evento lento fecharia
 * depois de um rapido e o finishedAt sairia antes do startedAt). So a chamada
 * de rede muda: aqui quem carrega o token e o `authedFetch`.
 */
export function useVoiceEventQueue({
  onAllDone,
}: UseVoiceEventQueueOptions): UseVoiceEventQueueResult {
  const [jobs, setJobs] = useState<VoiceJob[]>([]);
  const jobsRef = useRef<VoiceJob[]>([]);
  const runningRef = useRef(false);
  const onAllDoneRef = useRef(onAllDone);

  useEffect(() => {
    onAllDoneRef.current = onAllDone;
  }, [onAllDone]);

  const commit = useCallback((next: VoiceJob[]) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      for (;;) {
        const job = jobsRef.current.find((item) => item.status === "pending");
        if (!job) break;

        try {
          await createEventFromTranscript(job.transcript);
          commit(jobsRef.current.filter((item) => item.id !== job.id));
        } catch (error) {
          commit(
            jobsRef.current.map((item) =>
              item.id === job.id
                ? { ...item, status: "error" as const, error: describeVoiceEventError(error) }
                : item,
            ),
          );
        }
      }
    } finally {
      runningRef.current = false;
    }

    if (jobsRef.current.length === 0) onAllDoneRef.current();
  }, [commit]);

  const enqueue = useCallback(
    (transcript: string) => {
      jobCounter += 1;
      commit([
        ...jobsRef.current,
        { id: `voice-job-${jobCounter}`, transcript, status: "pending" },
      ]);
      void drain();
    },
    [commit, drain],
  );

  const retry = useCallback(
    (jobId: string) => {
      commit(
        jobsRef.current.map((item) =>
          item.id === jobId ? { ...item, status: "pending" as const, error: undefined } : item,
        ),
      );
      void drain();
    },
    [commit, drain],
  );

  const dismiss = useCallback(
    (jobId: string) => {
      commit(jobsRef.current.filter((item) => item.id !== jobId));
    },
    [commit],
  );

  return { jobs, enqueue, retry, dismiss };
}

function createEventFromTranscript(transcript: string): Promise<unknown> {
  return authedFetch("/api/events/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
}

/**
 * Traduz a falha de POST /api/events/voice pro texto que o toast mostra.
 *
 * Le o `status` por duck typing, e nao com `instanceof ApiError`, de proposito:
 * a unica coisa que importa aqui e o codigo HTTP, e testar por forma evita que
 * este arquivo puxe `@/lib/api/client` so pelo tipo do erro.
 */
export function describeVoiceEventError(error: unknown): string {
  const status = hasStatus(error) ? error.status : undefined;
  if (status === 401) return "Sessão expirada. Entre novamente.";
  if (status === 400) return "Não entendi o que você falou.";
  return "O agente não respondeu. Tente de novo.";
}

function hasStatus(error: unknown): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  );
}
