import { authedFetch } from "@/lib/api/authed-fetch";
import type { TaskSummaryDto, TimelineEventPageDto } from "@/lib/api/contracts";
import { FEED_HISTORY_MS, type NotificationSource } from "./due-notifications";

/** O maior aviso possivel e 30 dias (`MAX_NOTIFICATION_OFFSET_MINUTES`). */
const LOOK_AHEAD_MS = 31 * 24 * 60 * 60_000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

/**
 * Os eventos e as tarefas que ainda podem avisar: o que comeca entre as
 * ultimas 24h (para a lista do sino) e os proximos 30 dias. Cada falha parcial
 * e engolida — um aviso a menos e melhor que derrubar o sino.
 */
export async function loadNotificationSources(nowMs: number): Promise<NotificationSource[]> {
  const [events, tasks] = await Promise.all([loadEvents(nowMs), loadTasks(nowMs)]);
  return [...events, ...tasks];
}

async function loadEvents(nowMs: number): Promise<NotificationSource[]> {
  const sources: NotificationSource[] = [];
  const from = new Date(nowMs - FEED_HISTORY_MS).toISOString();
  const to = new Date(nowMs + LOOK_AHEAD_MS).toISOString();
  let cursor: string | undefined;

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({ from, to, limit: String(PAGE_LIMIT) });
      if (cursor) params.set("cursor", cursor);
      const response = await authedFetch<TimelineEventPageDto>(`/api/events?${params.toString()}`);
      for (const event of response.items) {
        if (event.notifyOffsetsMinutes.length === 0) continue;
        sources.push({
          kind: "event",
          id: event.id,
          name: event.name,
          startedAt: event.startedAt,
          notifyOffsetsMinutes: event.notifyOffsetsMinutes,
        });
      }
      cursor = response.nextCursor;
      if (!cursor) break;
    }
  } catch {}

  return sources;
}

async function loadTasks(nowMs: number): Promise<NotificationSource[]> {
  try {
    const tasks = await authedFetch<TaskSummaryDto[]>("/api/tasks");
    const earliest = nowMs - FEED_HISTORY_MS;
    return tasks.flatMap((task): NotificationSource[] => {
      if (task.status === "done" || task.status === "cancel") return [];
      if (!task.startedAt || task.notifyOffsetsMinutes.length === 0) return [];
      if (new Date(task.startedAt).getTime() < earliest) return [];
      return [
        {
          kind: "task",
          id: task.id,
          name: task.name,
          startedAt: task.startedAt,
          notifyOffsetsMinutes: task.notifyOffsetsMinutes,
        },
      ];
    });
  } catch {
    return [];
  }
}
