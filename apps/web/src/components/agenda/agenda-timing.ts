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
  // A agenda não tem estado "em andamento": o evento é futuro até acabar e passado depois
  // (sem hora de fim, vale o início).
  const position = (finished ?? started) > now ? "upcoming" : "past";
  return { position, startedAt: new Date(started).toISOString(), startLabel };
}
