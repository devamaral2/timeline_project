import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  CreateRecurrenceInput,
  RecurrenceDto,
  UpdateRecurrenceInput,
} from "@repo/contracts";
import { isRecurrenceTarget } from "../../../domain";
import { CurrentUser } from "../../request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import { CreateRecurrenceUseCase } from "../usecases/create-recurrence.usecase";
import { DeleteRecurrenceUseCase } from "../usecases/delete-recurrence.usecase";
import { GetRecurrenceUseCase, ListRecurrencesUseCase } from "../usecases/get-recurrence.usecase";
import { UpdateRecurrenceUseCase } from "../usecases/update-recurrence.usecase";

/**
 * As series ficam fora de `api/events` e `api/tasks` de proposito: uma serie
 * gera os dois, e assim nenhuma rota estatica disputa lugar com `:eventId`.
 */
@Controller("api/recurrences")
export class RecurrencesController {
  constructor(
    private readonly listRecurrences: ListRecurrencesUseCase,
    private readonly createRecurrence: CreateRecurrenceUseCase,
    private readonly getRecurrence: GetRecurrenceUseCase,
    private readonly updateRecurrence: UpdateRecurrenceUseCase,
    private readonly deleteRecurrence: DeleteRecurrenceUseCase,
  ) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<RecurrenceDto[]> {
    return this.listRecurrences.execute(undefined, actor);
  }

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateRecurrenceInput,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ recurrenceId: string }> {
    if (!isRecurrenceTarget(body?.target)) throw new BadRequestException("Invalid target");
    assertTemplateObject(body.template, true);
    return this.createRecurrence.execute(body, actor);
  }

  @Get(":recurrenceId")
  @UseGuards(GatewayIdentityGuard)
  async detail(
    @Param("recurrenceId") recurrenceId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RecurrenceDto> {
    const recurrence = await this.getRecurrence.execute({ recurrenceId }, actor);
    if (!recurrence) throw new NotFoundException("Recurrence not found");
    return recurrence;
  }

  @Patch(":recurrenceId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("recurrenceId") recurrenceId: string,
    @Body() body: Omit<UpdateRecurrenceInput, "recurrenceId">,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    if (!Number.isInteger(body?.expectedRevision) || body.expectedRevision < 1) {
      throw new BadRequestException("Invalid expectedRevision");
    }
    assertTemplateObject(body.template, false);
    if ((body as { target?: unknown }).target !== undefined) {
      throw new BadRequestException("The target of a recurrence cannot change");
    }
    await this.updateRecurrence.execute({ ...body, recurrenceId }, actor);
  }

  @Delete(":recurrenceId")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("recurrenceId") recurrenceId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteRecurrence.execute({ recurrenceId }, actor);
  }
}

/** A gramatica da regra e da entidade; aqui so o que ela nao ve. */
function assertTemplateObject(template: unknown, required: boolean): void {
  if (template === undefined && !required) return;
  if (typeof template !== "object" || template === null || Array.isArray(template)) {
    throw new BadRequestException("Invalid template");
  }
}
