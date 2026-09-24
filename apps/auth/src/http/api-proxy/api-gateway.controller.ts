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

    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (["host", "content-length", "authorization", "transfer-encoding", "connection"].includes(name)) continue;
      if (typeof value === "string") headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(", "));
    }
    const gatewayKey = this.env.internalServiceKey;
    if (!gatewayKey) throw new Error("AUTH_INTERNAL_SERVICE_KEY is not configured");
    headers.set("x-auth-gateway-key", gatewayKey);
    headers.set("x-auth-user-id", actor.userId);
    headers.set("x-auth-session-id", actor.sessionId);

    const upstreamUrl = new URL(request.originalUrl, this.env.apiServiceUrl);
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : JSON.stringify(body ?? {}),
    });
    response.status(upstream.status);
    upstream.headers.forEach((value, name) => {
      if (name !== "content-length" && name !== "transfer-encoding") response.setHeader(name, value);
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.send(buffer);
  }
}

function policyFor(method: string, path: string): {
  resource: "event" | "tag" | "task" | "recurrence" | "agent";
  action: "read" | "create" | "update" | "delete" | "execute";
} {
  const resource = path.startsWith("/api/events") ? "event"
    : path.startsWith("/api/tags") ? "tag"
    : path.startsWith("/api/tasks") ? "task"
    : path.startsWith("/api/recurrences") ? "recurrence"
    : path.startsWith("/api/ai") ? "agent"
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
