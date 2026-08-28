"use client";

import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, X } from "lucide-react";
import type { VoiceJob } from "@/lib/voice-events/use-voice-event-queue";

interface VoiceJobStatusProps {
  jobs: VoiceJob[];
  onRetry: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
}

export function VoiceJobStatus({ jobs, onRetry, onDismiss }: VoiceJobStatusProps) {
  if (jobs.length === 0) return null;

  const pendingCount = jobs.filter((job) => job.status === "pending").length;
  const failedJobs = jobs.filter((job) => job.status === "error");

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {failedJobs.map((job) => (
        <div
          key={job.id}
          className="surface-glass pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-full border border-destructive/40 py-2 pl-3 pr-2 text-sm shadow-card-hover duration-200 animate-in fade-in slide-in-from-bottom-2"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1 truncate text-foreground">{job.error}</span>
          <button
            type="button"
            onClick={() => onRetry(job.id)}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-brand-accent transition-colors hover:bg-accent"
          >
            Tentar de novo
          </button>
          <button
            type="button"
            onClick={() => onDismiss(job.id)}
            aria-label="Dispensar"
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ))}

      {pendingCount > 0 ? (
        <div className="surface-glass pointer-events-auto flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground shadow-card-hover duration-200 animate-in fade-in slide-in-from-bottom-2">
          <Loader2 aria-hidden className="size-4 animate-spin text-brand-accent" />
          {pendingCount === 1 ? "Criando evento..." : `Criando ${pendingCount} eventos...`}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
