import { Body, Controller, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { InspectInviteUseCase } from "../invites/usecases/inspect-invite.usecase";
@Controller("auth") export class PublicAuthController { constructor(@Inject(InspectInviteUseCase) private readonly inspect:InspectInviteUseCase) {} @Post("invites/inspect") async inspectInvite(@Body() body:unknown) { const {token}=z.object({token:z.string().min(1)}).strict().parse(body); return this.inspect.execute(token); } }
