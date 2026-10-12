import { Recurrence, type Note } from "../../domain";
import type { CreateRecurrenceInput } from "@repo/contracts";
import type { TaskRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import { prepareEventTemplate, prepareTaskTemplate } from "./recurrence-templates";

export interface PreparedRecurrence {
  recurrence: Recurrence;
  /** As notes novas do template, que precisam ser gravadas antes da serie. */
  notes: Note[];
}

/**
 * Valida a regra, resolve o template uma vez e monta a serie, sem gravar. E o
 * que `POST /api/recurrences` e o agente compartilham: quem grava decide como
 * (repositorio sozinho, ou no mesmo lote do turno do chat).
 */
export async function prepareRecurrence(
  deps: {
    createEvent: Pick<CreateEventUseCase, "prepare">;
    tasks: Pick<TaskRepository, "findById">;
  },
  input: CreateRecurrenceInput,
  actor: AuthenticatedUser,
): Promise<PreparedRecurrence> {
  const { target, template, ...rule } = input;
  // A regra e validada antes do template: nao adianta chamar o modelo para
  // resolver uma refeicao de uma serie que nunca vai acontecer.
  const draft = Recurrence.create({ userId: actor.userId, target, rule, template: {} });

  const prepared =
    input.target === "event"
      ? await prepareEventTemplate(deps.createEvent, input.template, draft.rule, actor)
      : {
          template: await prepareTaskTemplate(deps.tasks, input.template, draft.rule, actor),
          notes: [],
          noteIds: [],
        };

  const recurrence = Recurrence.create({
    id: draft.id,
    userId: actor.userId,
    target,
    rule: draft.rule,
    template: { ...prepared.template },
    noteIds: prepared.noteIds,
  });
  return { recurrence, notes: prepared.notes };
}
