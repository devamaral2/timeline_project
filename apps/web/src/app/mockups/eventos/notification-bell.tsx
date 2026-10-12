"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notificationOffsetLabel } from "@/components/events/event-visuals";
import { useNow } from "@/lib/events/use-now";
import {
  notificationFeedOf,
  readReadKeys,
  writeReadKeys,
  type DueNotification,
  type NotificationFeedItem,
  type NotificationSource,
} from "@/lib/notifications/due-notifications";
import { loadNotificationSources } from "@/lib/notifications/load-notification-sources";
import { useDueNotifications } from "@/lib/notifications/use-due-notifications";
import { agendaRefreshEvent } from "./agenda-refresh";
import styles from "./mockup.module.css";

const REFRESH_INTERVAL_MS = 5 * 60_000;
const PROMPT_DISMISSED_KEY = "braid:notifications:prompt-dismissed";

function browserPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function hrefOf(userId: string, item: { kind: "event" | "task"; sourceId: string }): string | undefined {
  return item.kind === "event" ? `/${userId}/eventos/${item.sourceId}` : undefined;
}

function showBrowserNotification(userId: string, notification: DueNotification) {
  if (browserPermission() !== "granted") return;
  try {
    const instance = new Notification(notification.name, {
      body: `${notification.kind === "task" ? "Tarefa" : "Evento"} · ${notificationOffsetLabel(notification.offsetMinutes)}`,
      tag: notification.key,
    });
    const href = hrefOf(userId, notification);
    instance.onclick = () => {
      window.focus();
      if (href) window.location.assign(href);
      instance.close();
    };
  } catch {
    // Navegadores moveis so aceitam Notification via service worker.
  }
}

function relativeAgo(nowMs: number, atMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - atMs) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)} h`;
}

function upcomingAt(nowMs: number, atMs: number): string {
  const at = new Date(atMs);
  const time = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(nowMs);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(at, today)) return `hoje às ${time}`;
  const tomorrow = new Date(nowMs + 24 * 60 * 60_000);
  if (sameDay(at, tomorrow)) return `amanhã às ${time}`;
  return `${at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${time}`;
}

/**
 * O sino do cabecalho: avisos que ja venceram nas ultimas 24h e os proximos,
 * todos derivados de `notify_offsets_minutes` de eventos e tarefas. Tambem e
 * quem entrega o aviso na hora — toast na pagina e notificacao do navegador —
 * em qualquer tela do app, nao so na agenda.
 */
export function NotificationBell({ userId }: { userId: string }) {
  const now = useNow();
  const nowMinute = now ? Math.floor(now.getTime() / 60_000) * 60_000 : null;
  const [sources, setSources] = useState<NotificationSource[]>([]);
  const [open, setOpen] = useState(false);
  const [readKeys, setReadKeys] = useState<Record<string, number>>({});
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [promptDismissed, setPromptDismissed] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReadKeys(readReadKeys());
    setPermission(browserPermission());
    try {
      setPromptDismissed(window.localStorage.getItem(PROMPT_DISMISSED_KEY) === "1");
    } catch {
      setPromptDismissed(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const loaded = await loadNotificationSources(Date.now());
      if (!cancelled) setSources(loaded);
    }
    void refresh();

    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(agendaRefreshEvent, refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(agendaRefreshEvent, refresh);
    };
  }, []);

  const onDue = useCallback(
    (notifications: DueNotification[]) => {
      for (const notification of notifications) showBrowserNotification(userId, notification);
    },
    [userId],
  );
  const { due, dismiss } = useDueNotifications(sources, now, onDue);

  const feed = useMemo(
    () => (nowMinute === null ? { recent: [], upcoming: [] } : notificationFeedOf(sources, nowMinute)),
    [sources, nowMinute],
  );
  const unread = feed.recent.filter((item) => !(item.key in readKeys));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function markRead(items: readonly NotificationFeedItem[]) {
    if (items.length === 0) return;
    const next = { ...readKeys };
    for (const item of items) next[item.key] = item.startedAtMs;
    setReadKeys(next);
    writeReadKeys(next, Date.now());
  }

  async function enableBrowserNotifications() {
    if (browserPermission() === "unsupported") return;
    setPermission(await Notification.requestPermission());
  }

  function dismissPrompt() {
    setPromptDismissed(true);
    try {
      window.localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    } catch {}
  }

  const showPermissionPrompt = permission === "default" && !promptDismissed && sources.length > 0;

  return (
    <div className={styles.notificationBell} ref={rootRef}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={unread.length > 0 ? `Notificações, ${unread.length} não lidas` : "Notificações"}
        title="Notificações"
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell aria-hidden />
        {unread.length > 0 ? <span className={styles.notificationBadge} aria-hidden>{unread.length > 9 ? "9+" : unread.length}</span> : null}
      </button>

      {open ? (
        <section id="notification-panel" className={styles.notificationPanel} aria-label="Notificações">
          <header>
            <h2>Notificações</h2>
            {unread.length > 0 ? <button type="button" onClick={() => markRead(unread)}>Marcar como lidas</button> : null}
          </header>

          {feed.recent.length === 0 && feed.upcoming.length === 0 ? (
            <p className={styles.notificationEmpty}>Nenhum aviso por enquanto. Defina um aviso ao criar um evento ou tarefa.</p>
          ) : null}

          {feed.recent.length > 0 ? (
            <>
              <h3>Recentes</h3>
              <ul>
                {feed.recent.map((item) => (
                  <NotificationRow
                    key={item.key}
                    item={item}
                    href={hrefOf(userId, item)}
                    caption={relativeAgo(nowMinute ?? 0, item.triggerAtMs)}
                    unread={!(item.key in readKeys)}
                    onOpen={() => markRead([item])}
                  />
                ))}
              </ul>
            </>
          ) : null}

          {feed.upcoming.length > 0 ? (
            <>
              <h3>Próximos</h3>
              <ul>
                {feed.upcoming.map((item) => (
                  <NotificationRow
                    key={item.key}
                    item={item}
                    href={hrefOf(userId, item)}
                    caption={upcomingAt(nowMinute ?? 0, item.triggerAtMs)}
                    unread={false}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {due.length > 0 || showPermissionPrompt ? (
        <div className={styles.notificationToasts} role="status" aria-live="polite">
          {showPermissionPrompt ? (
            <div className={styles.notificationToast}>
              <span>Receba os avisos mesmo fora desta aba.</span>
              <button type="button" onClick={() => void enableBrowserNotifications()}>Ativar</button>
              <button type="button" aria-label="Dispensar" onClick={dismissPrompt}>×</button>
            </div>
          ) : null}
          {due.map((notification) => {
            const href = hrefOf(userId, notification);
            const label = `${notification.name} — ${notificationOffsetLabel(notification.offsetMinutes)}`;
            return (
              <div key={notification.key} className={styles.notificationToast}>
                {href ? <a href={href}>{label}</a> : <span>{label}</span>}
                <button type="button" aria-label="Dispensar aviso" onClick={() => dismiss(notification.key)}>×</button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  item,
  href,
  caption,
  unread,
  onOpen,
}: {
  item: NotificationFeedItem;
  href?: string;
  caption: string;
  unread: boolean;
  onOpen?: () => void;
}) {
  const content = (
    <>
      <span className={styles.notificationDot} data-unread={unread} aria-hidden />
      <span className={styles.notificationText}>
        <strong>{item.name}</strong>
        <small>
          {item.kind === "task" ? "Tarefa" : "Evento"} · {notificationOffsetLabel(item.offsetMinutes)}
        </small>
      </span>
      <time>{caption}</time>
    </>
  );
  return (
    <li>
      {href ? <a href={href} onClick={onOpen}>{content}</a> : <button type="button" onClick={onOpen}>{content}</button>}
    </li>
  );
}
