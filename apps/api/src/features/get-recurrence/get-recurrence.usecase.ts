import { RecurrenceOwnershipError } from "../../domain";
import type { RecurrenceDto } from "@repo/contracts";
import type { RecurrenceRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { toRecurrenceDto } from "../../api-core/recurrences/recurrence.dto";

export class GetRecurrenceUseCase {
  constructor(private readonly recurrences: RecurrenceRepository) {}

  async execute(input: { recurrenceId: string }, actor: AuthenticatedUser): Promise<RecurrenceDto | null> {
    const recurrence = await this.recurrences.findById(input.recurrenceId);
    if (!recurrence) return null;
    if (recurrence.userId !== actor.userId) throw new RecurrenceOwnershipError();
    return toRecurrenceDto(recurrence);
  }
}
