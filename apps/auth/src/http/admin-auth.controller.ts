import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { parseRequest } from "./validation";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { CreateInviteUseCase } from "../invites/usecases/create-invite.usecase";
import { ReissueInviteUseCase } from "../invites/usecases/reissue-invite.usecase";
import { RevokeInviteUseCase } from "../invites/usecases/revoke-invite.usecase";
import { isPermission } from "../rbac/permissions";
import { SYSTEM_ROLES } from "../rbac/system-roles";
import { RevokeUserSessionsUseCase } from "../sessions/usecases/revoke-user-sessions.usecase";
import { ChangeUserStatusUseCase } from "../users/usecases/change-user-status.usecase";
import { ListUsersUseCase } from "../users/usecases/list-users.usecase";
import { ReplaceUserAccessUseCase } from "../users/usecases/replace-user-access.usecase";
import type { AuthenticatedActor } from "../users/user";
import { BearerAuthGuard } from "./bearer-auth.guard";
import { CurrentActor } from "./current-actor.decorator";
import { RequireSuperAdminGuard } from "./require-permission.guard";

// Os papeis do estagio 1 sao os de sistema, criados pela migracao. Validar
// contra esse catalogo aqui deixa "papel desconhecido" ser um 400 de forma,
// em vez de um erro de FK descoberto no meio da transacao.
const roleKeys = z.array(z.enum(SYSTEM_ROLES.map((role) => role.key) as [string, ...string[]])).max(16)
  .refine((keys) => new Set(keys).size === keys.length, "duplicate role");
const directPermissions = z.array(z.object({ permission: z.string().refine(isPermission), effect: z.enum(["allow", "deny"]) }).strict()).max(64)
  .refine((entries) => new Set(entries.map((entry) => entry.permission)).size === entries.length, "duplicate permission");

const createInviteBody = z.object({
  email: z.string().min(3).max(320).refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase()), "invalid email"),
  name: z.string().trim().min(1).max(120),
  roleKeys,
  directPermissions,
}).strict();
const accessBody = z.object({ roleKeys, directPermissions }).strict();
// `pending_invite` esta fora de proposito: quem ativa um convidado e o aceite
// do convite, no mesmo commit que grava senha e telefone.
const statusBody = z.object({ status: z.enum(["active", "suspended", "disabled"]) }).strict();
const listQuery = z.object({ cursor: z.string().min(1).max(64).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).strict();
const userIdParam = z.string().min(1).max(64);


@Controller("auth/admin")
@UseGuards(BearerAuthGuard, RequireSuperAdminGuard)
export class AdminAuthController {
  constructor(
    @Inject(CreateInviteUseCase) private readonly createInvite: CreateInviteUseCase,
    @Inject(ReissueInviteUseCase) private readonly reissueInvite: ReissueInviteUseCase,
    @Inject(RevokeInviteUseCase) private readonly revokeInvite: RevokeInviteUseCase,
    @Inject(ListUsersUseCase) private readonly listUsers: ListUsersUseCase,
    @Inject(ChangeUserStatusUseCase) private readonly changeUserStatus: ChangeUserStatusUseCase,
    @Inject(ReplaceUserAccessUseCase) private readonly replaceUserAccess: ReplaceUserAccessUseCase,
    @Inject(RevokeUserSessionsUseCase) private readonly revokeUserSessions: RevokeUserSessionsUseCase,
  ) {}

  private context(request: Request) { return request.context ?? ANONYMOUS_CONTEXT; }

  @Post("invites")
  @HttpCode(HttpStatus.CREATED)
  async invite(@Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(createInviteBody, body);
    return this.createInvite.execute({ actor, email: value.email, name: value.name, roleKeys: value.roleKeys, directPermissions: value.directPermissions, context: this.context(request) });
  }

  // A rota estatica vem antes de qualquer `:userId` -- e o mesmo cuidado que o
  // AGENTS.md documenta para `daily`/`ai`/`voice` em `apps/api`, onde o
  // parametro dinamico capturava as tres. `admin.e2e.test.ts` trava a ordem.
  @Get("users")
  async users(@Query() query: unknown) {
    const value = parseRequest(listQuery, query);
    return this.listUsers.execute({ cursor: value.cursor ?? null, limit: value.limit ?? null });
  }

  @Patch("users/:userId/status")
  async status(@Param("userId") userId: string, @Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(statusBody, body);
    return this.changeUserStatus.execute({ actor, targetUserId: parseRequest(userIdParam, userId), status: value.status, context: this.context(request) });
  }

  @Put("users/:userId/access")
  async access(@Param("userId") userId: string, @Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(accessBody, body);
    return this.replaceUserAccess.execute({ actor, targetUserId: parseRequest(userIdParam, userId), roleKeys: value.roleKeys, directPermissions: value.directPermissions, context: this.context(request) });
  }

  @Post("users/:userId/invite/reissue")
  @HttpCode(HttpStatus.OK)
  async reissue(@Param("userId") userId: string, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    return this.reissueInvite.execute({ actor, targetUserId: parseRequest(userIdParam, userId), context: this.context(request) });
  }

  @Delete("users/:userId/invite")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@Param("userId") userId: string, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request): Promise<void> {
    await this.revokeInvite.execute({ actor, targetUserId: parseRequest(userIdParam, userId), context: this.context(request) });
  }

  @Post("users/:userId/revoke-sessions")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSessions(@Param("userId") userId: string, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request): Promise<void> {
    await this.revokeUserSessions.execute({ actor, targetUserId: parseRequest(userIdParam, userId), context: this.context(request) });
  }
}
