import type { CreateRecurrenceInput } from "@repo/contracts";
import type { RecurrenceRepository, TaskRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { prepareRecurrence } from "../../api-core/recurrences/prepare-recurrence";

export class CreateRecurrenceUseCase {
  constructor(
    private readonly recurrences: RecurrenceRepository,
    private readonly createEvent: CreateEventUseCase,
    private readonly tasks: TaskRepository,
  ) {}

  async execute(input: CreateRecurrenceInput, actor: AuthenticatedUser): Promise<{ recurrenceId: string }> {
    const { recurrence, notes } = await prepareRecurrence(
      { createEvent: this.createEvent, tasks: this.tasks },
      input,
      actor,
    );
    await this.recurrences.save(recurrence, { created: notes });
    return { recurrenceId: recurrence.id };
  }
}
