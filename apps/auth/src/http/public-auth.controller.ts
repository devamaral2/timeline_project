import { BadRequestException, Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { InspectInviteUseCase } from "../invites/usecases/inspect-invite.usecase";
import { StartInviteAcceptanceUseCase } from "../authentication/usecases/start-invite-acceptance.usecase";
import { CompleteInviteAcceptanceUseCase } from "../authentication/usecases/complete-invite-acceptance.usecase";
import type { Request } from "express";
const inspectBody = z.object({ token: z.string().min(1) }).strict();
const acceptBody = z.object({ token: z.string().min(1).max(1024), password: z.string().min(1).max(1024), phone: z.string().min(1).max(64), channel: z.enum(["sms", "whatsapp"]) }).strict();
const verifyBody = z.object({ mfaToken: z.string().min(1).max(1024), code: z.string().min(1).max(64) }).strict();
function parse<T>(schema: z.ZodType<T>, body: unknown): T { const result = schema.safeParse(body); if (!result.success) throw new BadRequestException("invalid request"); return result.data; }
@Controller("auth") export class PublicAuthController { constructor(@Inject(InspectInviteUseCase) private readonly inspect:InspectInviteUseCase,@Inject(StartInviteAcceptanceUseCase) private readonly start:StartInviteAcceptanceUseCase,@Inject(CompleteInviteAcceptanceUseCase) private readonly complete:CompleteInviteAcceptanceUseCase) {} @Post("invites/inspect") async inspectInvite(@Body() body:unknown) { return this.inspect.execute(parse(inspectBody,body).token); } @Post("invites/accept") async accept(@Body() body:unknown,@Req() request:Request){const value=parse(acceptBody,body);return this.start.execute({inviteToken:value.token,password:value.password,phoneE164:value.phone,mfaChannel:value.channel,context:request.context!});} @Post("mfa/verify") @HttpCode(200) async verify(@Body() body:unknown,@Req() request:Request){const value=parse(verifyBody,body);return this.complete.execute({mfaToken:value.mfaToken,code:value.code,context:request.context!});}}
