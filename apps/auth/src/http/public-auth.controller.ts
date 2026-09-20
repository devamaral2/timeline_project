import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { z } from "zod";
import type { Request } from "express";
import { parseRequest } from "./validation";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { InspectInviteUseCase } from "../invites/usecases/inspect-invite.usecase";
import { AcceptInviteUseCase } from "../authentication/usecases/accept-invite.usecase";
import { StartLoginUseCase } from "../authentication/usecases/start-login.usecase";

const inspectBody = z.object({ token: z.string().min(1) }).strict();
const acceptBody = z.object({ token: z.string().min(1).max(1024), password: z.string().min(1).max(1024) }).strict();
const loginBody = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024) }).strict();

@Controller("auth")
export class PublicAuthController {
  constructor(
    @Inject(InspectInviteUseCase) private readonly inspect: InspectInviteUseCase,
    @Inject(AcceptInviteUseCase) private readonly acceptInvite: AcceptInviteUseCase,
    @Inject(StartLoginUseCase) private readonly login: StartLoginUseCase,
  ) {}

  private context(request: Request) { return request.context ?? ANONYMOUS_CONTEXT; }

  @Post("invites/inspect")
  async inspectInvite(@Body() body: unknown) {
    return this.inspect.execute(parseRequest(inspectBody, body).token);
  }

  @Post("invites/accept")
  async accept(@Body() body: unknown, @Req() request: Request) {
    const value = parseRequest(acceptBody, body);
    return this.acceptInvite.execute({ inviteToken: value.token, password: value.password, context: this.context(request) });
  }

  @Post("login")
  async loginWithPassword(@Body() body: unknown, @Req() request: Request) {
    const value = parseRequest(loginBody, body);
    return this.login.execute({ ...value, context: this.context(request) });
  }
}
