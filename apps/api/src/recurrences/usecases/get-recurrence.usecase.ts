import { RecurrenceOwnershipError } from "@repo/entities";
import type { RecurrenceDto } from "@repo/entities/contracts";
import type { RecurrenceRepository } from "@repo/entities/ports";
import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { toRecurrenceDto } from "./recurrence.dto";

export class GetRecurrenceUseCase {
  constructor(private readonly recurrences: RecurrenceRepository) {}

  async execute(input: { recurrenceId: string }, actor: AuthenticatedUser): Promise<RecurrenceDto | null> {
    const recurrence = await this.recurrences.findById(input.recurrenceId);
    if (!recurrence) return null;
    if (recurrence.userId !== actor.userId) throw new RecurrenceOwnershipError();
    return toRecurrenceDto(recurrence);
  }
}

export class ListRecurrencesUseCase {
  constructor(private readonly recurrences: RecurrenceRepository) {}

  async execute(_input: unknown, actor: AuthenticatedUser): Promise<RecurrenceDto[]> {
    const recurrences = await this.recurrences.listByUserId(actor.userId);
    return recurrences.map(toRecurrenceDto);
  }
}
