import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EventRepository, RecurrenceRepository } from "../../domain/ports";
import type { CreateRecurrenceInput } from "@repo/contracts";
import type { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { prepareRecurrence } from "../../api-core/recurrences/prepare-recurrence";

export class CreateRecurrenceUseCase {
  constructor(
    private readonly recurrences: Pick<RecurrenceRepository, "save">,
    private readonly createEvent: Pick<CreateEventUseCase, "prepare">,
    private readonly events: Pick<EventRepository, "findByIds">,
  ) {}

  async execute(input: CreateRecurrenceInput, actor: AuthenticatedUser): Promise<{ recurrenceId: string }> {
    const { recurrence, artifacts, derivations } = await prepareRecurrence(
      { createEvent: this.createEvent, events: this.events },
      input,
      actor,
    );
    await this.recurrences.save(recurrence, { created: artifacts, derivations });
    return { recurrenceId: recurrence.id };
  }
}
