"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dueNotificationsOf,
  readFiredKeys,
  recordFiredKeys,
  type DueNotification,
  type NotificationSource,
} from "./due-notifications";

/**
 * Os avisos que acabaram de vencer.
 *
 * `now` e o mesmo relogio de `useNow()` — o chamador ja assina o timer
 * compartilhado. As chaves ja disparadas ficam no `localStorage`: recarregar a
 * pagina ou abrir outra aba nao repete o aviso, e um aviso que venceu enquanto
 * a aba estava fechada ainda aparece (dentro da janela de recuperacao).
 */
export function useDueNotifications(
  sources: readonly NotificationSource[],
  now: Date | null,
  onDue?: (notifications: DueNotification[]) => void,
): { due: DueNotification[]; dismiss: (key: string) => void } {
  const firedRef = useRef<Set<string> | null>(null);
  const onDueRef = useRef(onDue);
  const [due, setDue] = useState<DueNotification[]>([]);

  useEffect(() => {
    onDueRef.current = onDue;
  }, [onDue]);

  useEffect(() => {
    if (!now) return;
    const nowMs = now.getTime();
    firedRef.current ??= readFiredKeys();

    const result = dueNotificationsOf(sources, nowMs, firedRef.current);
    if (result.settled.length === 0) return;

    for (const { key } of result.settled) firedRef.current.add(key);
    recordFiredKeys(result.settled, nowMs);

    if (result.due.length > 0) {
      setDue((current) => [...current, ...result.due]);
      onDueRef.current?.(result.due);
    }
  }, [sources, now]);

  const dismiss = useCallback((key: string) => {
    setDue((current) => current.filter((item) => item.key !== key));
  }, []);

  return { due, dismiss };
}
