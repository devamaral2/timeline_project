import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { RecurrenceNotFoundError, RecurrenceOwnershipError } from "../../domain";
import type { EventRepository, RecurrenceRepository } from "../../domain/ports";
import type { UpdateRecurrenceInput } from "@repo/contracts";
import type { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { reviseRecurrence } from "../../api-core/recurrences/revise-recurrence";

/**
 * Editar a serie vale de hoje em diante: as ocorrencias de hoje para frente que
 * ninguem mexeu a mao sao apagadas e regeradas na proxima leitura. O passado
 * fica como aconteceu.
 */
export class UpdateRecurrenceUseCase {
  constructor(
    private readonly recurrences: Pick<RecurrenceRepository, "findById" | "update">,
    private readonly createEvent: Pick<CreateEventUseCase, "prepare">,
    private readonly events: Pick<EventRepository, "findByIds">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: UpdateRecurrenceInput, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.recurrences.findById(input.recurrenceId);
    if (!existing) throw new RecurrenceNotFoundError(`Recurrence not found: ${input.recurrenceId}`);
    if (existing.userId !== actor.userId) throw new RecurrenceOwnershipError();

    const { recurrenceId: _id, expectedRevision, template, ...ruleChanges } = input;
    const { recurrence, artifacts, derivations, fromDay } = await reviseRecurrence(
      { createEvent: this.createEvent, events: this.events },
      existing,
      { rule: ruleChanges, template },
      actor,
      this.clock(),
    );

    await this.recurrences.update(recurrence, actor.userId, expectedRevision, fromDay, { created: artifacts, derivations });
  }
}
