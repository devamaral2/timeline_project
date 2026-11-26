import {
  All,
  Body,
  Controller,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuthorizationService } from "../../auth-core/security/authorization.service";
import { BearerAuthGuard } from "../../auth-core/security/bearer-auth.guard";
import { CurrentActor } from "../../auth-core/security/current-actor.decorator";
import type { AuthenticatedActor } from "../../domain/users/user";
import type { RuntimeEnv } from "../../config/env";
import { RUNTIME_ENV } from "../../config/tokens";
import { Inject } from "@nestjs/common";
import { forwardToApi } from "./api-gateway.forward";

const bodyWithUser = z.object({ userId: z.string().min(1).max(128).optional() }).passthrough();

@Controller("api")
export class ApiGatewayController {
  constructor(
    @Inject(AuthorizationService) private readonly authorize: AuthorizationService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
  ) {}

  @All("*path")
  @UseGuards(BearerAuthGuard)
  async forward(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<void> {
    const policy = policyFor(request.method, request.path);
    const parsedBody = bodyWithUser.safeParse(body);
    const targetUserId = policy.resource === "agent" && parsedBody.success ? parsedBody.data.userId : undefined;
    await this.authorize.execute({
      userId: actor.userId,
      sessionId: actor.sessionId,
      resource: policy.resource,
      action: policy.action,
      targetUserId,
    });

    await forwardToApi(this.env, request, response, body, {
      "x-auth-user-id": actor.userId,
      "x-auth-session-id": actor.sessionId,
    });
  }
}

export function policyFor(method: string, path: string): {
  resource: "task" | "tag" | "artifact" | "recurrence" | "agent";
  action: "read" | "create" | "update" | "delete" | "execute";
} {
  const resource = path.startsWith("/api/tasks") ? "task"
    : path.startsWith("/api/tags") ? "tag"
    : path.startsWith("/api/artifacts") ? "artifact"
    : path.startsWith("/api/recurrences") ? "recurrence"
    : path.startsWith("/api/ai") || path.startsWith("/api/requests") ? "agent"
    : null;
  if (!resource) throw new Error(`No gateway policy for ${path}`);
  const action = method === "GET" ? "read"
    : method === "POST" ? (resource === "agent" ? "execute" : "create")
    : method === "PATCH" || method === "PUT" ? "update"
    : method === "DELETE" ? "delete"
    : null;
  if (!action) throw new Error(`No gateway policy for ${method} ${path}`);
  return { resource, action };
}
