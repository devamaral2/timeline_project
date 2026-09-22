import type { RecurrenceDto } from "@repo/contracts";
import type { RecurrenceRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { toRecurrenceDto } from "../../api-core/recurrences/recurrence.dto";

export class ListRecurrencesUseCase {
  constructor(private readonly recurrences: RecurrenceRepository) {}

  async execute(_input: unknown, actor: AuthenticatedUser): Promise<RecurrenceDto[]> {
    const recurrences = await this.recurrences.listByUserId(actor.userId);
    return recurrences.map(toRecurrenceDto);
  }
}
