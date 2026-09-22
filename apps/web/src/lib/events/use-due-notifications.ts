"use client";

import { useEffect, useRef, useState } from "react";
import type { NotificationOffsetMinutes } from "@/lib/api/contracts";

export interface DueNotificationSource {
  id: string;
  name: string;
  startedAt: string;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
}

export interface DueNotification {
  key: string;
  eventId: string;
  name: string;
  offsetMinutes: NotificationOffsetMinutes;
}

/**
 * Os avisos que acabaram de vencer, enquanto a aba esta aberta.
 *
 * `now` e o mesmo relogio de `useNow()` — o chamador ja assina o timer
 * compartilhado, e duplicar a assinatura aqui so custaria um segundo timer
 * identico.
 *
 * Um evento so dispara um toast se o cruzamento aconteceu depois que este
 * hook passou a observa-lo: um evento que ja chega com o horario do aviso no
 * passado (a timeline mostrando um dia anterior, por exemplo) e marcado como
 * visto silenciosamente, sem inundar a tela com avisos de coisas que ja
 * passaram ha muito tempo.
 */
export function useDueNotifications(
  events: readonly DueNotificationSource[],
  now: Date | null,
): { due: DueNotification[]; dismiss: (key: string) => void } {
  const seenRef = useRef<Set<string>>(new Set());
  const firedRef = useRef<Set<string>>(new Set());
  const [due, setDue] = useState<DueNotification[]>([]);

  useEffect(() => {
    if (!now) return;
    const nowMs = now.getTime();
    const newlyDue: DueNotification[] = [];

    for (const event of events) {
      for (const offsetMinutes of event.notifyOffsetsMinutes ?? []) {
        const key = `${event.id}:${offsetMinutes}`;
        if (firedRef.current.has(key)) continue;

        const triggerAtMs = new Date(event.startedAt).getTime() - offsetMinutes * 60_000;
        const isDue = nowMs >= triggerAtMs;
        const alreadySeen = seenRef.current.has(key);
        seenRef.current.add(key);

        if (!isDue) continue;
        firedRef.current.add(key);
        if (alreadySeen) {
          newlyDue.push({ key, eventId: event.id, name: event.name, offsetMinutes });
        }
      }
    }

    if (newlyDue.length > 0) {
      setDue((current) => [...current, ...newlyDue]);
    }
  }, [events, now]);

  function dismiss(key: string) {
    setDue((current) => current.filter((item) => item.key !== key));
  }

  return { due, dismiss };
}
