"use client";

import { useEffect, useRef } from "react";
import { aiJobs, isJobPending } from "./ai-jobs";

/**
 * Timeline cards omit note data. Discover durable jobs once (and on explicit
 * mutation refresh), then query only unfinished ids and stop when terminal.
 */
export function useAiJobRefresh(enabled: boolean, refreshEvent: string, refresh: () => void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    async function poll() {
      if (running || disposed) return;
      running = true;
      let changed = false;
      await Promise.all([...pending].map(async (id) => {
        try {
          const job = await aiJobs.get(id);
          if (!isJobPending(job)) { pending.delete(id); changed = true; }
        } catch { /* Keep tracking accepted jobs after transport loss. */ }
      }));
      running = false;
      if (disposed) return;
      if (changed) {
        refreshRef.current();
        // Transcript completion can enqueue a meal job; discover that child
        // before deciding that tracking is finished.
        await discover();
      }
      if (pending.size && !disposed) timer = setTimeout(() => void poll(), 1500);
    }
    async function discover() {
      try {
        const list = await aiJobs.list();
        if (disposed) return;
        for (const job of list) if (isJobPending(job)) pending.add(job.id);
      } catch { /* No new submission is inferred from a failed list. */ }
    }
    async function start() {
      await discover();
      if (!running && pending.size && !disposed) {
        clearTimeout(timer);
        timer = setTimeout(() => void poll(), 1500);
      }
    }
    void start();
    window.addEventListener(refreshEvent, start);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener(refreshEvent, start);
    };
  }, [enabled, refreshEvent]);
}
