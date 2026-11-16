import type { TaskCardDto, NotificationOffsetMinutes } from "@repo/contracts";

/** O que o aviso precisa de um evento: o cartao da agenda ou da lista de acompanhados serve. */
export type NotificationSource = Pick<
  TaskCardDto,
  "id" | "name" | "status" | "longRunning" | "startedAt" | "estimatedFinishAt" | "notifyOffsetsMinutes"
>;

/** Acompanhado (`task`) e o que tem status ou e longo; o resto e so agenda (`event`). Mesmo criterio da API. */
export type NotificationKind = "event" | "task";

export interface DueNotification {
  key: string;
  kind: NotificationKind;
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

/** Quanto tempo uma chave disparada fica guardada depois do instante de referencia do item. */
const FIRED_RETENTION_MS = 24 * 60 * 60_000;

export function kindOf(source: NotificationSource): NotificationKind {
  return source.status !== undefined || source.longRunning ? "task" : "event";
}

/**
 * O instante de que o aviso conta: o inicio, e no evento longo o prazo. `undefined`
 * quando nao ha o que avisar: sem data, evento longo sem prazo, ou ja concluido ou cancelado.
 */
export function notificationAnchorOf(source: NotificationSource): string | undefined {
  if (source.status === "done" || source.status === "cancel") return undefined;
  return source.longRunning ? source.estimatedFinishAt : source.startedAt;
}

function anchorTimingOf(source: NotificationSource): { anchor: string; anchorMs: number } | undefined {
  const anchor = notificationAnchorOf(source);
  if (anchor === undefined) return undefined;
  const anchorMs = new Date(anchor).getTime();
  return Number.isNaN(anchorMs) ? undefined : { anchor, anchorMs };
}

export function notificationKeyOf(source: NotificationSource, offsetMinutes: NotificationOffsetMinutes): string {
  // O instante de referencia entra na chave: remarcar um evento (ou mudar o prazo do longo) recria o aviso.
  return `${source.id}:${notificationAnchorOf(source) ?? ""}:${offsetMinutes}`;
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
): { due: DueNotification[]; settled: Array<{ key: string; anchorMs: number }> } {
  const due: DueNotification[] = [];
  const settled: Array<{ key: string; anchorMs: number }> = [];

  for (const source of sources) {
    const timing = anchorTimingOf(source);
    if (!timing) continue;

    for (const offsetMinutes of source.notifyOffsetsMinutes) {
      const key = notificationKeyOf(source, offsetMinutes);
      if (firedKeys.has(key)) continue;

      const triggerAtMs = timing.anchorMs - offsetMinutes * 60_000;
      if (nowMs < triggerAtMs) continue;

      settled.push({ key, anchorMs: timing.anchorMs });
      const stillRelevant = nowMs < timing.anchorMs && nowMs - triggerAtMs <= CATCH_UP_WINDOW_MS;
      if (stillRelevant) {
        due.push({ key, kind: kindOf(source), sourceId: source.id, name: source.name, offsetMinutes });
      }
    }
  }

  return { due, settled };
}

const FIRED_STORAGE_KEY = "braid:notifications:fired";

/** Chave -> instante de referencia do item (ms), para podar o que ja nao importa. */
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

/** Guarda as chaves e poda as de itens cujo instante de referencia passou ha mais de um dia. */
export function recordFiredKeys(entries: ReadonlyArray<{ key: string; anchorMs: number }>, nowMs: number): void {
  if (entries.length === 0) return;
  const record = readFiredRecord();
  for (const { key, anchorMs } of entries) record[key] = anchorMs;
  for (const [key, anchorMs] of Object.entries(record)) {
    if (!Number.isFinite(anchorMs) || anchorMs < nowMs - FIRED_RETENTION_MS) delete record[key];
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
  kind: NotificationKind;
  sourceId: string;
  name: string;
  offsetMinutes: NotificationOffsetMinutes;
  /** Quando o aviso vence (ms). */
  triggerAtMs: number;
  /** O instante de referencia do item (inicio, ou prazo do longo), em ms. */
  anchorMs: number;
}

/**
 * A lista do sino, derivada so dos cartoes de agenda e de acompanhados: o que ja
 * venceu nas ultimas 24h (mais recente primeiro) e os proximos avisos (mais
 * proximo primeiro). Nao ha historico guardado — web e Android calculam o
 * mesmo resultado a partir dos mesmos eventos.
 */
export function notificationFeedOf(
  sources: readonly NotificationSource[],
  nowMs: number,
): { recent: NotificationFeedItem[]; upcoming: NotificationFeedItem[] } {
  const recent: NotificationFeedItem[] = [];
  const upcoming: NotificationFeedItem[] = [];

  for (const source of sources) {
    const timing = anchorTimingOf(source);
    if (!timing) continue;

    for (const offsetMinutes of source.notifyOffsetsMinutes) {
      const triggerAtMs = timing.anchorMs - offsetMinutes * 60_000;
      const item: NotificationFeedItem = {
        key: notificationKeyOf(source, offsetMinutes),
        kind: kindOf(source),
        sourceId: source.id,
        name: source.name,
        offsetMinutes,
        triggerAtMs,
        anchorMs: timing.anchorMs,
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

/** Chaves lidas -> instante de referencia do item (ms), para podar. */
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
  for (const [key, anchorMs] of Object.entries(record)) {
    if (Number.isFinite(anchorMs) && anchorMs >= nowMs - 2 * FEED_HISTORY_MS) pruned[key] = anchorMs;
  }
  try {
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(pruned));
  } catch {}
}
