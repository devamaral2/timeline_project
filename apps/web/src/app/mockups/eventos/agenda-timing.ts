import { zonedDayStart } from "@repo/timeline";
import type { ExampleEvent } from "./agenda-examples";

/** Apenas a posição temporal das fixtures; nunca altera task ou missed. */
export function timingForExample(event: ExampleEvent, dayKey: string, now: number) {
  const startLabel = event.time.split(" — ")[0];
  const [hours, minutes] = startLabel.split(":").map(Number);
  const started = event.startedAt
    ? new Date(event.startedAt).getTime()
    : zonedDayStart(dayKey).getTime() + (hours * 60 + minutes) * 60_000;
  const finished = event.finishedAt
    ? new Date(event.finishedAt).getTime()
    : event.running ? undefined : started + event.minutes * 60_000;
  const position = started <= now && finished === undefined ? "running"
    : finished !== undefined && finished <= now ? "past" : "upcoming";
  return { position, startedAt: new Date(started).toISOString(), startLabel };
}
