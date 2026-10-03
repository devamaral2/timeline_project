import { Recurrence } from "../../domain";
import type { CreateRecurrenceInput } from "@repo/contracts";
import type { RecurrenceRepository, TaskRepository } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { prepareEventTemplate, prepareTaskTemplate } from "../../api-core/recurrences/recurrence-templates";

export class CreateRecurrenceUseCase {
  constructor(
    private readonly recurrences: RecurrenceRepository,
    private readonly createEvent: CreateEventUseCase,
    private readonly tasks: TaskRepository,
  ) {}

  async execute(input: CreateRecurrenceInput, actor: AuthenticatedUser): Promise<{ recurrenceId: string }> {
    const { target, template, ...rule } = input;
    // A regra e validada antes do template: nao adianta chamar o modelo para
    // resolver uma refeicao de uma serie que nunca vai acontecer.
    const draft = Recurrence.create({ userId: actor.userId, target, rule, template: {} });

    const prepared =
      input.target === "event"
        ? await prepareEventTemplate(this.createEvent, input.template, draft.rule, actor)
        : {
            template: await prepareTaskTemplate(this.tasks, input.template, draft.rule, actor),
            notes: [],
            noteIds: [],
          };

    const recurrence = Recurrence.create({
      id: draft.id,
      userId: actor.userId,
      target,
      rule: draft.rule,
      template: { ...prepared.template },
      noteIds: prepared.noteIds,
    });
    await this.recurrences.save(recurrence, { created: prepared.notes });
    return { recurrenceId: recurrence.id };
  }
}
