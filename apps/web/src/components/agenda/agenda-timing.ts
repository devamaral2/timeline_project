import { zonedDayStart } from "@repo/timeline";
import type { ExampleTask } from "./agenda-examples";
import type { TimeSpan } from "./free-time";

/** Início e fim do evento no relógio; `endMs` nulo é um evento ainda sem fim. */
export function spanForExample(task: ExampleTask, dayKey: string): TimeSpan & { startLabel: string } {
  const startLabel = task.time.split(" — ")[0];
  const [hours, minutes] = startLabel.split(":").map(Number);
  const startMs = task.startedAt
    ? new Date(task.startedAt).getTime()
    : zonedDayStart(dayKey).getTime() + (hours * 60 + minutes) * 60_000;
  const endMs = task.finishedAt
    ? new Date(task.finishedAt).getTime()
    : task.running ? null : startMs + task.minutes * 60_000;
  return { startMs, endMs, startLabel };
}

/** Apenas a posição temporal das fixtures; nunca altera task ou missed. */
export function timingForExample(task: ExampleTask, dayKey: string, now: number) {
  const { startMs: started, endMs: finished, startLabel } = spanForExample(task, dayKey);
  // Passado depois do fim (sem hora de fim, vale o início); em andamento entre o
  // início e o fim; a seguir antes disso. O estado é só do relógio: aparece na
  // borda e no ponto do ícone, sem rótulo.
  const position = (finished ?? started) <= now ? "past" : started <= now ? "running" : "upcoming";
  return { position, startedAt: new Date(started).toISOString(), startLabel };
}
