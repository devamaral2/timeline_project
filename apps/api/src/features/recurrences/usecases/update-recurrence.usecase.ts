import { RecurrenceNotFoundError, RecurrenceOwnershipError, type Recurrence } from "../../../domain";
import type {
  EventRecurrenceTemplate,
  TaskRecurrenceTemplate,
  UpdateRecurrenceInput,
} from "@repo/contracts";
import type { RecurrenceRepository, TaskRepository } from "../../../domain/ports";
import { shiftDayKey } from "@repo/timeline";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import type { CreateEventUseCase } from "../../events/usecases/create-event.usecase";
import {
  prepareEventTemplate,
  prepareTaskTemplate,
  todayOf,
} from "../services/recurrence-templates";

/**
 * Editar a serie vale de hoje em diante: as ocorrencias de hoje para frente que
 * ninguem mexeu a mao sao apagadas e regeradas na proxima leitura. O passado
 * fica como aconteceu.
 */
export class UpdateRecurrenceUseCase {
  constructor(
    private readonly recurrences: RecurrenceRepository,
    private readonly createEvent: CreateEventUseCase,
    private readonly tasks: TaskRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: UpdateRecurrenceInput, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.recurrences.findById(input.recurrenceId);
    if (!existing) throw new RecurrenceNotFoundError(`Recurrence not found: ${input.recurrenceId}`);
    if (existing.userId !== actor.userId) throw new RecurrenceOwnershipError();

    const { recurrenceId: _id, expectedRevision, template, ...ruleChanges } = input;
    // A regra revisada vem primeiro: o template novo e resolvido com a janela dela.
    const withRule = existing.revise({ rule: ruleChanges });
    const stored =
      template === undefined
        ? undefined
        : withRule.target === "event"
          ? await prepareEventTemplate(this.createEvent, template as EventRecurrenceTemplate, withRule.rule, actor)
          : await prepareTaskTemplate(this.tasks, template as TaskRecurrenceTemplate, withRule.rule, actor);
    let revised: Recurrence = existing.revise({
      rule: ruleChanges,
      template: stored ? { ...stored } : undefined,
    });

    const today = todayOf(revised.rule, this.clock());
    const yesterday = shiftDayKey(today, -1);
    // A regeracao recomeca em hoje; ontem para tras ja esta gerado e fica.
    if (existing.materializedThrough && yesterday >= revised.rule.startsOn) {
      revised = revised.materializedUntil(yesterday);
    }

    await this.recurrences.update(revised, actor.userId, expectedRevision, today);
  }
}
