import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { RecurrenceRepository } from "../../domain/ports";
import type { RecurrenceDto } from "@repo/contracts";
import { toRecurrenceDto } from "../../api-core/recurrences/recurrence.dto";

export class ListRecurrencesUseCase {
  constructor(private readonly recurrences: Pick<RecurrenceRepository, "listByUserId">) {}

  async execute(actor: AuthenticatedUser): Promise<RecurrenceDto[]> {
    return (await this.recurrences.listByUserId(actor.userId)).map(toRecurrenceDto);
  }
}
