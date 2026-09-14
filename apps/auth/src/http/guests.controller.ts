import { Body, Controller, Delete, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { NotFoundError } from "../common/errors";
import { PostgresGuestRepository } from "../guests/postgres-guest.repository";
import { IssueGuestLinkUseCase } from "../guests/usecases/issue-guest-link.usecase";
import type { UserActor } from "../users/user";
import { AcceptTokenKinds } from "./accept-token-kinds.decorator";
import { BearerAuthGuard } from "./bearer-auth.guard";
import { CurrentActor } from "./current-actor.decorator";
import { RequireSuperAdminGuard } from "./require-permission.guard";
import { parseRequest } from "./validation";

const issueBody = z.object({ subjectUserId: z.string().min(1).max(64) }).strict();
const guestIdParam = z.string().min(1).max(64);

/** Emissao e revogacao de guests. So admin, e so com token de usuario. */
@Controller("auth/guests")
@UseGuards(BearerAuthGuard, RequireSuperAdminGuard)
@AcceptTokenKinds("user")
export class GuestsController {
  constructor(
    @Inject(IssueGuestLinkUseCase) private readonly issue: IssueGuestLinkUseCase,
    @Inject(PostgresGuestRepository) private readonly guests: PostgresGuestRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentActor() actor: UserActor) {
    return this.issue.execute({ actor, subjectUserId: parseRequest(issueBody, body).subjectUserId });
  }

  /**
   * Apaga a linha do guest. O JWT ja emitido continua criptograficamente valido
   * ate expirar (no maximo uma hora), mas um consumidor que confere `subj`
   * contra `users.observes_user_id` — regra 3 do contrato — passa a recusa-lo
   * na hora, porque a linha nao existe mais.
   */
  @Delete(":guestId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param("guestId") guestId: string): Promise<void> {
    if (!(await this.guests.deleteGuest(parseRequest(guestIdParam, guestId)))) throw new NotFoundError("unknown guest");
  }
}
