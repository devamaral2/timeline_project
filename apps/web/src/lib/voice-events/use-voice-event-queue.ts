"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { getClientApp } from "@/lib/firebase/client-app";

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

  // Um job de cada vez, em ordem. Em paralelo, um evento lento (comida faz duas chamadas ao
  // modelo) gravaria depois de um rapido e o fecharia com um finishedAt anterior ao startedAt.
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
          const message =
            error instanceof Error ? error.message : "Não foi possível criar o evento.";
          commit(
            jobsRef.current.map((item) =>
              item.id === job.id ? { ...item, status: "error" as const, error: message } : item,
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

async function createEventFromTranscript(transcript: string): Promise<void> {
  const currentUser = getAuth(getClientApp()).currentUser;
  if (!currentUser) throw new Error("Entre na sua conta para criar eventos por voz.");

  const token = await currentUser.getIdToken();
  const response = await fetch("/api/events/voice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ transcript }),
  });

  if (response.ok) return;
  if (response.status === 401) throw new Error("Sessão expirada. Entre novamente.");
  if (response.status === 400) throw new Error("Não entendi o que você falou.");
  throw new Error("O agente não respondeu. Tente de novo.");
}
