"use client";

import { useEffect, useRef } from "react";

/** Poll only while displayed meal notes have unfinished generation. */
export function usePendingMealRefresh(pending: boolean, refresh: () => Promise<unknown> | void) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!pending) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try { await refreshRef.current(); } catch { /* Retain the visible note on transport failures. */ }
      if (!disposed) timer = setTimeout(() => void tick(), 1500);
    }
    timer = setTimeout(() => void tick(), 1500);
    return () => { disposed = true; clearTimeout(timer); };
  }, [pending]);
}
