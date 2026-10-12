import { zonedDayStart } from "@repo/timeline";
import type { ExampleEvent } from "./agenda-examples";
import type { TimeSpan } from "./free-time";

/** Início e fim do evento no relógio; `endMs` nulo é um evento ainda sem fim. */
export function spanForExample(event: ExampleEvent, dayKey: string): TimeSpan & { startLabel: string } {
  const startLabel = event.time.split(" — ")[0];
  const [hours, minutes] = startLabel.split(":").map(Number);
  const startMs = event.startedAt
    ? new Date(event.startedAt).getTime()
    : zonedDayStart(dayKey).getTime() + (hours * 60 + minutes) * 60_000;
  const endMs = event.finishedAt
    ? new Date(event.finishedAt).getTime()
    : event.running ? null : startMs + event.minutes * 60_000;
  return { startMs, endMs, startLabel };
}

/** Apenas a posição temporal das fixtures; nunca altera task ou missed. */
export function timingForExample(event: ExampleEvent, dayKey: string, now: number) {
  const { startMs: started, endMs: finished, startLabel } = spanForExample(event, dayKey);
  // Em andamento é tudo o que já começou e ainda não acabou — com ou sem hora
  // de fim; a mesma regra de `eventPositionOf`, usada pelo card da timeline.
  const position = now < started ? "upcoming"
    : finished === null || finished > now ? "running" : "past";
  return { position, startedAt: new Date(started).toISOString(), startLabel };
}
