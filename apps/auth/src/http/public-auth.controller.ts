import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { parseRequest } from "./validation";
import type { Request } from "express";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { InspectInviteUseCase } from "../invites/usecases/inspect-invite.usecase";
import { StartInviteAcceptanceUseCase } from "../authentication/usecases/start-invite-acceptance.usecase";
import { StartLoginUseCase } from "../authentication/usecases/start-login.usecase";
import { VerifyMfaUseCase } from "../authentication/usecases/verify-mfa.usecase";
import { CompleteLoginUseCase } from "../authentication/usecases/complete-login.usecase";
import { ResendMfaUseCase } from "../authentication/usecases/resend-mfa.usecase";
const inspectBody = z.object({ token: z.string().min(1) }).strict();
const acceptBody = z.object({ token: z.string().min(1).max(1024), password: z.string().min(1).max(1024), phone: z.string().min(1).max(64), channel: z.enum(["sms", "whatsapp"]) }).strict();
const loginBody = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024), secondFactor: z.enum(["otp", "recovery"]) }).strict();
const verifyBody = z.object({ mfaToken: z.string().min(1).max(1024), code: z.string().min(1).max(64) }).strict();
const recoverBody = z.object({ mfaToken: z.string().min(1).max(1024), recoveryCode: z.string().min(1).max(128) }).strict();
const resendBody = z.object({ mfaToken: z.string().min(1).max(1024) }).strict();
@Controller("auth") export class PublicAuthController {
  constructor(@Inject(InspectInviteUseCase) private readonly inspect:InspectInviteUseCase,@Inject(StartInviteAcceptanceUseCase) private readonly start:StartInviteAcceptanceUseCase,@Inject(StartLoginUseCase) private readonly login:StartLoginUseCase,@Inject(VerifyMfaUseCase) private readonly verifyMfa:VerifyMfaUseCase,@Inject(CompleteLoginUseCase) private readonly complete:CompleteLoginUseCase,@Inject(ResendMfaUseCase) private readonly resend:ResendMfaUseCase) {}
  private context(request:Request){ return request.context ?? ANONYMOUS_CONTEXT; }
  @Post("invites/inspect") async inspectInvite(@Body() body:unknown) { return this.inspect.execute(parseRequest(inspectBody,body).token); }
  @Post("invites/accept") async accept(@Body() body:unknown,@Req() request:Request){const value=parseRequest(acceptBody,body);return this.start.execute({inviteToken:value.token,password:value.password,phoneE164:value.phone,mfaChannel:value.channel,context:this.context(request)});}
  @Post("login") @HttpCode(HttpStatus.ACCEPTED) async startLogin(@Body() body:unknown,@Req() request:Request){const value=parseRequest(loginBody,body);return this.login.execute({...value,context:this.context(request)});}
  @Post("mfa/verify") @HttpCode(HttpStatus.OK) async verify(@Body() body:unknown,@Req() request:Request){const value=parseRequest(verifyBody,body);return this.verifyMfa.execute({mfaToken:value.mfaToken,code:value.code,context:this.context(request)});}
  @Post("mfa/recover") @HttpCode(HttpStatus.OK) async recover(@Body() body:unknown,@Req() request:Request){const value=parseRequest(recoverBody,body);return this.complete.recover({...value,context:this.context(request)});}
  @Post("mfa/resend") @HttpCode(HttpStatus.ACCEPTED) async resendMfa(@Body() body:unknown){const value=parseRequest(resendBody,body);return this.resend.execute(value.mfaToken);}
}
