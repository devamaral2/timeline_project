import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { TaskRepository, RecurrenceRepository } from "../../domain/ports";
import type { CreateRecurrenceInput } from "@repo/contracts";
import type { CreateTaskUseCase } from "../../api-core/tasks/create-task.usecase";
import { prepareRecurrence } from "../../api-core/recurrences/prepare-recurrence";

export class CreateRecurrenceUseCase {
  constructor(
    private readonly recurrences: Pick<RecurrenceRepository, "save">,
    private readonly createTask: Pick<CreateTaskUseCase, "prepare">,
    private readonly tasks: Pick<TaskRepository, "findByIds">,
  ) {}

  async execute(input: CreateRecurrenceInput, actor: AuthenticatedUser): Promise<{ recurrenceId: string }> {
    const { recurrence, artifacts, derivations } = await prepareRecurrence(
      { createTask: this.createTask, tasks: this.tasks },
      input,
      actor,
    );
    await this.recurrences.save(recurrence, { created: artifacts, derivations });
    return { recurrenceId: recurrence.id };
  }
}
