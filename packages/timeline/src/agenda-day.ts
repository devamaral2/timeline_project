import type { TaskCardDto } from "@repo/contracts";

/** Uma tarefa da agenda: sempre tem inicio. */
export type AgendaTaskCard = TaskCardDto & { startedAt: string };

/** Um dia da agenda com as tarefas exibidas para ele. */
export interface AgendaDay {
  /** Chave no formato YYYY-MM-DD no fuso da agenda. */
  dayKey: string;
  isToday: boolean;
  tasks: AgendaTaskCard[];
}
