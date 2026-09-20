import { RecurrenceNotFoundError, RecurrenceOwnershipError } from "../../../domain";
import type { RecurrenceRepository } from "../../../domain/ports";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import { todayOf } from "../services/recurrence-templates";

/** Apaga a serie e as ocorrencias de hoje em diante; as passadas ficam, sem vinculo. */
export class DeleteRecurrenceUseCase {
  constructor(
    private readonly recurrences: RecurrenceRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { recurrenceId: string }, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.recurrences.findById(input.recurrenceId);
    if (!existing) throw new RecurrenceNotFoundError(`Recurrence not found: ${input.recurrenceId}`);
    if (existing.userId !== actor.userId) throw new RecurrenceOwnershipError();
    await this.recurrences.delete(existing.id, actor.userId, todayOf(existing.rule, this.clock()));
  }
}
