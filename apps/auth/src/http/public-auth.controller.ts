import { Body, Controller, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { InspectInviteUseCase } from "../invites/usecases/inspect-invite.usecase";
import { StartInviteAcceptanceUseCase } from "../authentication/usecases/start-invite-acceptance.usecase";
import type { Request } from "express";
@Controller("auth") export class PublicAuthController { constructor(@Inject(InspectInviteUseCase) private readonly inspect:InspectInviteUseCase,@Inject(StartInviteAcceptanceUseCase) private readonly start:StartInviteAcceptanceUseCase) {} @Post("invites/inspect") async inspectInvite(@Body() body:unknown) { const {token}=z.object({token:z.string().min(1)}).strict().parse(body); return this.inspect.execute(token); } @Post("invites/accept") async accept(@Body() body:unknown){const value=z.object({token:z.string().min(1).max(1024),password:z.string().min(1).max(1024),phone:z.string().min(1).max(64),channel:z.enum(["sms","whatsapp"])}).strict().parse(body);return this.start.execute({inviteToken:value.token,password:value.password,phoneE164:value.phone,mfaChannel:value.channel,context:{correlationId:"",ipAddress:null,userAgent:null}});}}
