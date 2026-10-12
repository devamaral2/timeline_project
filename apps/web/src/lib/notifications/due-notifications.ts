import type { NotificationOffsetMinutes } from "@/lib/api/contracts";

export type NotificationSourceKind = "event" | "task";

export interface NotificationSource {
  kind: NotificationSourceKind;
  id: string;
  name: string;
  startedAt: string;
  notifyOffsetsMinutes: readonly NotificationOffsetMinutes[];
}

export interface DueNotification {
  key: string;
  kind: NotificationSourceKind;
  sourceId: string;
  name: string;
  offsetMinutes: NotificationOffsetMinutes;
}

/**
 * Quanto tempo depois do horario do aviso ele ainda vale a pena. Abrir a aba
 * minutos depois do horario ainda mostra o aviso; abrir horas depois nao —
 * "1 dia antes" aparecendo as 22h do dia anterior so atrapalha.
 */
export const CATCH_UP_WINDOW_MS = 60 * 60_000;

/** Quanto tempo uma chave disparada fica guardada depois do inicio do item. */
const FIRED_RETENTION_MS = 24 * 60 * 60_000;

export function notificationKeyOf(source: NotificationSource, offsetMinutes: NotificationOffsetMinutes): string {
  // `startedAt` entra na chave: remarcar um evento recria o aviso.
  return `${source.kind}:${source.id}:${source.startedAt}:${offsetMinutes}`;
}

/**
 * Separa o que ja cruzou o horario do aviso do que ainda vai cruzar.
 *
 * - `due`: cruzou, o item ainda nao comecou e o horario esta dentro da janela
 *   de recuperacao — mostrar ao usuario.
 * - `settled`: cruzou (mostrado ou nao) — nunca mais reavaliar.
 */
export function dueNotificationsOf(
  sources: readonly NotificationSource[],
  nowMs: number,
  firedKeys: ReadonlySet<string>,
): { due: DueNotification[]; settled: Array<{ key: string; startedAtMs: number }> } {
  const due: DueNotification[] = [];
  const settled: Array<{ key: string; startedAtMs: number }> = [];

  for (const source of sources) {
    const startedAtMs = new Date(source.startedAt).getTime();
    if (Number.isNaN(startedAtMs)) continue;

    for (const offsetMinutes of source.notifyOffsetsMinutes) {
      const key = notificationKeyOf(source, offsetMinutes);
      if (firedKeys.has(key)) continue;

      const triggerAtMs = startedAtMs - offsetMinutes * 60_000;
      if (nowMs < triggerAtMs) continue;

      settled.push({ key, startedAtMs });
      const stillRelevant = nowMs < startedAtMs && nowMs - triggerAtMs <= CATCH_UP_WINDOW_MS;
      if (stillRelevant) {
        due.push({ key, kind: source.kind, sourceId: source.id, name: source.name, offsetMinutes });
      }
    }
  }

  return { due, settled };
}

const FIRED_STORAGE_KEY = "braid:notifications:fired";

/** Chave -> inicio do item (ms), para podar o que ja nao importa. */
type FiredRecord = Record<string, number>;

function readFiredRecord(): FiredRecord {
  try {
    const raw = window.localStorage.getItem(FIRED_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as FiredRecord;
  } catch {
    return {};
  }
}

export function readFiredKeys(): Set<string> {
  return new Set(Object.keys(readFiredRecord()));
}

/** Guarda as chaves e poda as de itens que comecaram ha mais de um dia. */
export function recordFiredKeys(entries: ReadonlyArray<{ key: string; startedAtMs: number }>, nowMs: number): void {
  if (entries.length === 0) return;
  const record = readFiredRecord();
  for (const { key, startedAtMs } of entries) record[key] = startedAtMs;
  for (const [key, startedAtMs] of Object.entries(record)) {
    if (!Number.isFinite(startedAtMs) || startedAtMs < nowMs - FIRED_RETENTION_MS) delete record[key];
  }
  try {
    window.localStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(record));
  } catch {}
}

/** Quanto tempo atras uma notificacao ainda aparece na lista do sino. */
export const FEED_HISTORY_MS = 24 * 60 * 60_000;
/** Quantos avisos futuros a lista do sino mostra. */
export const FEED_UPCOMING_LIMIT = 5;

export interface NotificationFeedItem {
  key: string;
  kind: NotificationSourceKind;
  sourceId: string;
  name: string;
  offsetMinutes: NotificationOffsetMinutes;
  /** Quando o aviso vence (ms). */
  triggerAtMs: number;
  startedAtMs: number;
}

/**
 * A lista do sino, derivada so da coluna `notify_offsets_minutes`: o que ja
 * venceu nas ultimas 24h (mais recente primeiro) e os proximos avisos (mais
 * proximo primeiro). Nao ha historico guardado — web e Android calculam o
 * mesmo resultado a partir dos mesmos eventos e tarefas.
 */
export function notificationFeedOf(
  sources: readonly NotificationSource[],
  nowMs: number,
): { recent: NotificationFeedItem[]; upcoming: NotificationFeedItem[] } {
  const recent: NotificationFeedItem[] = [];
  const upcoming: NotificationFeedItem[] = [];

  for (const source of sources) {
    const startedAtMs = new Date(source.startedAt).getTime();
    if (Number.isNaN(startedAtMs)) continue;

    for (const offsetMinutes of source.notifyOffsetsMinutes) {
      const triggerAtMs = startedAtMs - offsetMinutes * 60_000;
      const item: NotificationFeedItem = {
        key: notificationKeyOf(source, offsetMinutes),
        kind: source.kind,
        sourceId: source.id,
        name: source.name,
        offsetMinutes,
        triggerAtMs,
        startedAtMs,
      };
      if (triggerAtMs > nowMs) upcoming.push(item);
      else if (nowMs - triggerAtMs <= FEED_HISTORY_MS) recent.push(item);
    }
  }

  recent.sort((a, b) => b.triggerAtMs - a.triggerAtMs);
  upcoming.sort((a, b) => a.triggerAtMs - b.triggerAtMs);
  return { recent, upcoming: upcoming.slice(0, FEED_UPCOMING_LIMIT) };
}

const READ_STORAGE_KEY = "braid:notifications:read";

/** Chaves lidas -> inicio do item (ms), para podar. */
export function readReadKeys(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

export function writeReadKeys(record: Record<string, number>, nowMs: number): void {
  const pruned: Record<string, number> = {};
  for (const [key, startedAtMs] of Object.entries(record)) {
    if (Number.isFinite(startedAtMs) && startedAtMs >= nowMs - 2 * FEED_HISTORY_MS) pruned[key] = startedAtMs;
  }
  try {
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(pruned));
  } catch {}
}
