import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { GetMeUseCase } from "../sessions/usecases/get-me.usecase";
import { LogoutAllUseCase } from "../sessions/usecases/logout-all.usecase";
import { RefreshSessionUseCase } from "../sessions/usecases/refresh-session.usecase";
import { RevokeSessionUseCase } from "../sessions/usecases/revoke-session.usecase";
import type { AuthenticatedActor } from "../users/user";
import { BearerAuthGuard } from "./bearer-auth.guard";
import { CurrentActor } from "./current-actor.decorator";

const refreshTokenBody = z.object({ refreshToken: z.string().min(1).max(1024) }).strict();

@Controller("auth")
export class AuthenticatedAuthController {
  constructor(
    @Inject(RefreshSessionUseCase) private readonly refreshSession: RefreshSessionUseCase,
    @Inject(RevokeSessionUseCase) private readonly revokeSession: RevokeSessionUseCase,
    @Inject(LogoutAllUseCase) private readonly logoutAll: LogoutAllUseCase,
    @Inject(GetMeUseCase) private readonly getMe: GetMeUseCase,
  ) {}

  @Post("token/refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown, @Req() request: Request) {
    const value = refreshTokenBody.parse(body);
    const result = await this.refreshSession.execute({
      refreshToken: value.refreshToken,
      context: request.context ?? ANONYMOUS_CONTEXT,
    });
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown, @Req() request: Request): Promise<void> {
    const value = refreshTokenBody.parse(body);
    await this.revokeSession.execute({
      refreshToken: value.refreshToken,
      context: request.context ?? ANONYMOUS_CONTEXT,
    });
  }

  @Post("logout-all")
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutEverywhere(@CurrentActor() actor: AuthenticatedActor, @Req() request: Request): Promise<void> {
    await this.logoutAll.execute({ actor, context: request.context ?? ANONYMOUS_CONTEXT });
  }

  @Get("me")
  @UseGuards(BearerAuthGuard)
  async me(@CurrentActor() actor: AuthenticatedActor) {
    return this.getMe.execute(actor);
  }
}
