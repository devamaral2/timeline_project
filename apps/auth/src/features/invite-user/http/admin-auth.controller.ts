import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { parseRequest } from "../../../http/validation";
import { ANONYMOUS_CONTEXT } from "../../../common/request-context";
import { CreateInviteUseCase } from "../usecases/create-invite.usecase";
import { isPermission } from "../../../domain/rbac/permissions";
import { SYSTEM_ROLES } from "../../../domain/rbac/system-roles";
import type { AuthenticatedActor } from "../../../domain/users/user";
import { BearerAuthGuard } from "../../authenticate-user/http/bearer-auth.guard";
import { CurrentActor } from "../../authenticate-user/http/current-actor.decorator";
import { RequireSuperAdminGuard } from "../../authorize-access/http/require-permission.guard";

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


@Controller("auth/admin")
@UseGuards(BearerAuthGuard, RequireSuperAdminGuard)
export class AdminAuthController {
  constructor(
    @Inject(CreateInviteUseCase) private readonly createInvite: CreateInviteUseCase,
  ) {}

  private context(request: Request) { return request.context ?? ANONYMOUS_CONTEXT; }

  @Post("invites")
  @HttpCode(HttpStatus.CREATED)
  async invite(@Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(createInviteBody, body);
    return this.createInvite.execute({ actor, email: value.email, name: value.name, roleKeys: value.roleKeys, directPermissions: value.directPermissions, context: this.context(request) });
  }

}
