import { Recurrence, type Artifact } from "../../domain";
import type { CreateRecurrenceInput } from "@repo/contracts";
import type { TaskRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateTaskUseCase, PrepareTaskOptions } from "../tasks/create-task.usecase";
import { prepareTemplate } from "./recurrence-templates";

export interface PreparedRecurrence {
  recurrence: Recurrence;
  /** Os artefatos novos do template, que precisam ser gravados antes da serie. */
  artifacts: Artifact[];
  derivations: { originalId: string; copyId: string }[];
}

export interface RecurrenceTemplateDeps {
  createTask: Pick<CreateTaskUseCase, "prepare">;
  tasks: Pick<TaskRepository, "findByIds">;
}

/**
 * Valida a regra, resolve o template uma vez e monta a serie, sem gravar. E o
 * que `POST /api/recurrences` e o agente compartilham: quem grava decide como
 * (repositorio sozinho, ou no mesmo lote do passo do agente).
 */
export async function prepareRecurrence(
  deps: RecurrenceTemplateDeps,
  input: CreateRecurrenceInput,
  actor: AuthenticatedUser,
  options?: PrepareTaskOptions,
): Promise<PreparedRecurrence> {
  const { template, ...rule } = input;
  // A regra e validada antes do template: nao adianta resolver o template de
  // uma serie que nunca vai acontecer.
  const draft = Recurrence.create({ userId: actor.userId, rule, template: {} });
  const prepared = await prepareTemplate(deps, template, draft.rule, actor, options);

  const recurrence = Recurrence.create({
    id: draft.id,
    userId: actor.userId,
    rule: draft.rule,
    template: { ...prepared.template },
  });
  return { recurrence, artifacts: prepared.artifacts, derivations: prepared.derivations };
}
