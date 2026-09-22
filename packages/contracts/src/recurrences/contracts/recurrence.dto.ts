import type { CreateEventInput } from "../../events/contracts/create-event.input";
import type { WorkItemPriority } from "../../work-items/types/work-item-priority";
import type { RecurrenceRule, RecurrenceTarget } from "./recurrence-rule";

/** O que cada ocorrencia de evento copia. A janela vem da regra, nunca daqui. */
export type EventRecurrenceTemplate = Omit<CreateEventInput, "startedAt" | "finishedAt">;

/** O que cada ocorrencia de tarefa copia. */
export interface TaskRecurrenceTemplate {
  name?: string;
  description?: string;
  tags?: string[];
  priority?: WorkItemPriority;
  /** Pai fixo: cada ocorrencia nasce como subtarefa dele. */
  parentTaskId?: string;
}

export type RecurrenceTemplateInput =
  | { target: "event"; template: EventRecurrenceTemplate }
  | { target: "task"; template: TaskRecurrenceTemplate };

export type CreateRecurrenceInput = RecurrenceRule & RecurrenceTemplateInput;

export interface UpdateRecurrenceInput extends Partial<RecurrenceRule> {
  recurrenceId: string;
  expectedRevision: number;
  /** Troca o template inteiro; o alvo (`event`/`task`) da serie nao muda. */
  template?: EventRecurrenceTemplate | TaskRecurrenceTemplate;
}

/**
 * O template volta como foi guardado, e nao como entrou: uma refeicao entra
 * como texto livre e e guardada ja resolvida em alimentos, para que cada
 * ocorrencia nao passe pelo modelo de novo.
 */
export type RecurrenceDto = RecurrenceRule & {
  id: string;
  target: RecurrenceTarget;
  template: Record<string, unknown>;
  revision: number;
};
