import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ANONYMOUS_CONTEXT } from "../../../common/request-context";
import { parseRequest } from "../../../http/validation";
import { AcceptInviteUseCase } from "../usecases/accept-invite.usecase";
import { InspectInviteUseCase } from "../usecases/inspect-invite.usecase";

const inspectBody = z.object({ token: z.string().min(1) }).strict();
const acceptBody = z.object({ token: z.string().min(1).max(1024), password: z.string().min(1).max(1024) }).strict();

@Controller("auth/invites")
export class PublicInviteController {
  constructor(
    @Inject(InspectInviteUseCase) private readonly inspect: InspectInviteUseCase,
    @Inject(AcceptInviteUseCase) private readonly acceptInvite: AcceptInviteUseCase,
  ) {}

  @Post("inspect")
  async inspectInvite(@Body() body: unknown) {
    return this.inspect.execute(parseRequest(inspectBody, body).token);
  }

  @Post("accept")
  async accept(@Body() body: unknown, @Req() request: Request) {
    const value = parseRequest(acceptBody, body);
    return this.acceptInvite.execute({
      inviteToken: value.token,
      password: value.password,
      context: request.context ?? ANONYMOUS_CONTEXT,
    });
  }
}
