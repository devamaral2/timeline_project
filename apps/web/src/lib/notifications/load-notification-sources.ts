import type { TaskCardDto } from "@repo/contracts";
import { listAgenda, listTrackedEvents } from "@/lib/api/events";
import { FEED_HISTORY_MS, type NotificationSource } from "./due-notifications";

/** O maior aviso possivel e 30 dias (`MAX_NOTIFICATION_OFFSET_MINUTES`). */
const LOOK_AHEAD_MS = 31 * 24 * 60 * 60_000;

/**
 * Os eventos que ainda podem avisar: a agenda das ultimas 24h (para a lista do
 * sino) e os proximos 30 dias, mais a lista de acompanhados. Um evento que esta
 * nas duas listas entra uma vez so. Cada falha parcial e engolida — um aviso a
 * menos e melhor que derrubar o sino.
 */
export async function loadNotificationSources(nowMs: number): Promise<NotificationSource[]> {
  const range = {
    from: new Date(nowMs - FEED_HISTORY_MS).toISOString(),
    to: new Date(nowMs + LOOK_AHEAD_MS).toISOString(),
  };
  const [agenda, tracked] = await Promise.all([
    listAgenda(range).catch((): TaskCardDto[] => []),
    listTrackedEvents().catch((): TaskCardDto[] => []),
  ]);

  const byId = new Map<string, NotificationSource>();
  for (const card of [...agenda, ...tracked]) {
    if (!byId.has(card.id)) byId.set(card.id, card);
  }
  return [...byId.values()];
}
