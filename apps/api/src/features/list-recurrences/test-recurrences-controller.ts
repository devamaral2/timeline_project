import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateRecurrenceInput, UpdateRecurrenceInput } from "@repo/contracts";
import type { CreateRecurrenceUseCase } from "../create-recurrence/create-recurrence.usecase";
import type { DeleteRecurrenceUseCase } from "../delete-recurrence/delete-recurrence.usecase";
import type { GetRecurrenceUseCase } from "../get-recurrence/get-recurrence.usecase";
import type { ListRecurrencesUseCase } from "./list-recurrences.usecase";
import type { UpdateRecurrenceUseCase } from "../update-recurrence/update-recurrence.usecase";
import { isRecurrenceTarget } from "../../domain";
import { assertRecurrenceTemplate } from "../../api-core/http-input-validation";

export class RecurrencesController {
  constructor(
    private readonly listRecurrences: ListRecurrencesUseCase,
    private readonly createRecurrence: CreateRecurrenceUseCase,
    private readonly getRecurrence: GetRecurrenceUseCase,
    private readonly updateRecurrence: UpdateRecurrenceUseCase,
    private readonly deleteRecurrence: DeleteRecurrenceUseCase,
  ) {}
  list(actor: AuthenticatedUser) { return this.listRecurrences.execute(undefined, actor); }
  async create(body: CreateRecurrenceInput, actor: AuthenticatedUser) {
    if (!isRecurrenceTarget(body?.target)) throw new BadRequestException("Invalid target");
    assertRecurrenceTemplate(body.template, true);
    return this.createRecurrence.execute(body, actor);
  }
  async detail(recurrenceId: string, actor: AuthenticatedUser) {
    const result = await this.getRecurrence.execute({ recurrenceId }, actor);
    if (!result) throw new BadRequestException("Recurrence not found");
    return result;
  }
  async update(recurrenceId: string, body: Omit<UpdateRecurrenceInput, "recurrenceId">, actor: AuthenticatedUser) {
    if (!Number.isInteger(body?.expectedRevision) || body.expectedRevision < 1) {
      throw new BadRequestException("Invalid expectedRevision");
    }
    assertRecurrenceTemplate(body.template, false);
    if ((body as { target?: unknown }).target !== undefined) {
      throw new BadRequestException("The target of a recurrence cannot change");
    }
    return this.updateRecurrence.execute({ ...body, recurrenceId }, actor);
  }
  remove(recurrenceId: string, actor: AuthenticatedUser) { return this.deleteRecurrence.execute({ recurrenceId }, actor); }
}
