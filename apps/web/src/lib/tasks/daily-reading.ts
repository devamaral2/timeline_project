import type { TaskDto } from "@repo/contracts";

/** O nome da tarefa em que as páginas e os vídeos guardados no dia se juntam (CONTEXT.md). */
const DAILY_READING_NAME = "Leitura diária";

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** A tarefa de pessoa "Leitura diária": "Leitura Diaria" e "leitura  diária" são a mesma, como na API. */
export function isDailyReading(task: Pick<TaskDto, "actor" | "name">): boolean {
  return task.actor === "human" && fold(task.name) === fold(DAILY_READING_NAME);
}
