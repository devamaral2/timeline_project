import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { parseRequest } from "./validation";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { ChangePasswordUseCase } from "../authentication/usecases/change-password.usecase";
import { CompleteStepUpUseCase } from "../authentication/usecases/complete-step-up.usecase";
import { RegenerateRecoveryCodesUseCase } from "../authentication/usecases/regenerate-recovery-codes.usecase";
import { StartStepUpUseCase } from "../authentication/usecases/start-step-up.usecase";
import { GetMeUseCase } from "../sessions/usecases/get-me.usecase";
import { LogoutAllUseCase } from "../sessions/usecases/logout-all.usecase";
import { RefreshSessionUseCase } from "../sessions/usecases/refresh-session.usecase";
import { RevokeSessionUseCase } from "../sessions/usecases/revoke-session.usecase";
import type { AuthenticatedActor } from "../users/user";
import { BearerAuthGuard } from "./bearer-auth.guard";
import { CurrentActor } from "./current-actor.decorator";

const refreshTokenBody = z.object({ refreshToken: z.string().min(1).max(1024) }).strict();
const stepUpToken = z.string().min(1).max(1024);
const startStepUpBody = z.object({ purpose: z.enum(["password_change", "recovery_regeneration"]), secondFactor: z.enum(["otp", "recovery"]) }).strict();
const verifyStepUpBody = z.object({ stepUpToken, code: z.string().min(1).max(64) }).strict();
const recoverStepUpBody = z.object({ stepUpToken, recoveryCode: z.string().min(1).max(128) }).strict();
const changePasswordBody = z.object({ stepUpToken, newPassword: z.string().min(1).max(1024) }).strict();
const regenerateRecoveryCodesBody = z.object({ stepUpToken }).strict();


@Controller("auth")
export class AuthenticatedAuthController {
  constructor(
    @Inject(RefreshSessionUseCase) private readonly refreshSession: RefreshSessionUseCase,
    @Inject(RevokeSessionUseCase) private readonly revokeSession: RevokeSessionUseCase,
    @Inject(LogoutAllUseCase) private readonly logoutAll: LogoutAllUseCase,
    @Inject(GetMeUseCase) private readonly getMe: GetMeUseCase,
    @Inject(StartStepUpUseCase) private readonly startStepUp: StartStepUpUseCase,
    @Inject(CompleteStepUpUseCase) private readonly completeStepUp: CompleteStepUpUseCase,
    @Inject(ChangePasswordUseCase) private readonly changePassword: ChangePasswordUseCase,
    @Inject(RegenerateRecoveryCodesUseCase) private readonly regenerateRecoveryCodes: RegenerateRecoveryCodesUseCase,
  ) {}

  private context(request: Request) { return request.context ?? ANONYMOUS_CONTEXT; }

  // @HttpCode(OK): sem isso o Nest devolveria 201 para um POST, que e o que
  // PublicAuthController.accept faz hoje (nenhum dos dois metodos de lá tem
  // @HttpCode). Achei 201 errado para um refresh — RFC 6749 espera 200 do
  // endpoint de token — e preferi acertar aqui a copiar a inconsistencia.
  @Post("token/refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: unknown, @Req() request: Request) {
    const value = parseRequest(refreshTokenBody, body);
    const result = await this.refreshSession.execute({ refreshToken: value.refreshToken, context: this.context(request) });
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown, @Req() request: Request): Promise<void> {
    const value = parseRequest(refreshTokenBody, body);
    await this.revokeSession.execute({ refreshToken: value.refreshToken, context: this.context(request) });
  }

  @Post("logout-all")
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutEverywhere(@CurrentActor() actor: AuthenticatedActor, @Req() request: Request): Promise<void> {
    await this.logoutAll.execute({ actor, context: this.context(request) });
  }

  @Post("step-up/start")
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async beginStepUp(@Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(startStepUpBody, body);
    return this.startStepUp.execute({ actor, purpose: value.purpose, secondFactor: value.secondFactor, context: this.context(request) });
  }

  @Post("step-up/verify")
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyStepUp(@Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(verifyStepUpBody, body);
    return this.completeStepUp.verify({ actor, stepUpToken: value.stepUpToken, code: value.code, context: this.context(request) });
  }

  @Post("step-up/recover")
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async recoverStepUp(@Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(recoverStepUpBody, body);
    return this.completeStepUp.recover({ actor, stepUpToken: value.stepUpToken, recoveryCode: value.recoveryCode, context: this.context(request) });
  }

  @Post("password/change")
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changeOwnPassword(@Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(changePasswordBody, body);
    return this.changePassword.execute({ actor, stepUpToken: value.stepUpToken, newPassword: value.newPassword, context: this.context(request) });
  }

  @Post("recovery-codes/regenerate")
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async regenerateOwnRecoveryCodes(@Body() body: unknown, @CurrentActor() actor: AuthenticatedActor, @Req() request: Request) {
    const value = parseRequest(regenerateRecoveryCodesBody, body);
    return this.regenerateRecoveryCodes.execute({ actor, stepUpToken: value.stepUpToken, context: this.context(request) });
  }

  @Get("me")
  @UseGuards(BearerAuthGuard)
  async me(@CurrentActor() actor: AuthenticatedActor) {
    return this.getMe.execute(actor);
  }
}
