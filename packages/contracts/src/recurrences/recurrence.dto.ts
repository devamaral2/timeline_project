import type { CreateTaskInput } from "../tasks/task.input";
import type { RecurrenceRule } from "./recurrence-rule";

/**
 * O que cada ocorrencia copia. A janela vem da regra, nunca daqui. So tarefas
 * de pessoa se repetem, e uma tarefa longa nao se repete. `artifactIds` sao os
 * mesmos artefatos em todas as ocorrencias; `previousTaskIds`, as tarefas
 * de que cada ocorrencia nasce se seguindo.
 */
export type RecurrenceTemplate = Omit<
  CreateTaskInput,
  "startedAt" | "estimatedFinishAt" | "finishedAt" | "longRunning" | "nextTaskIds"
>;

export type CreateRecurrenceInput = RecurrenceRule & { template: RecurrenceTemplate };

export interface UpdateRecurrenceInput extends Partial<RecurrenceRule> {
  recurrenceId: string;
  expectedRevision: number;
  /** Troca o template inteiro. */
  template?: RecurrenceTemplate;
}

/**
 * O template volta como foi guardado, e nao como entrou: os artefatos novos do
 * template entram como conteudo e sao guardados ja como ids, para que cada
 * ocorrencia aponte para o mesmo artefato.
 */
export type RecurrenceDto = RecurrenceRule & {
  id: string;
  template: Record<string, unknown>;
  revision: number;
};
