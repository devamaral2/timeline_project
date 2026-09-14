import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { normalizePhone } from "../signup/phone";
import { SignupUseCase } from "../signup/usecases/signup.usecase";
import type { SignupActor } from "../users/user";
import { AcceptTokenKinds } from "./accept-token-kinds.decorator";
import { BearerAuthGuard } from "./bearer-auth.guard";
import { CurrentActor } from "./current-actor.decorator";
import { parseRequest } from "./validation";

/**
 * A confirmacao de senha mora aqui, e nao na politica de senha: comparar duas
 * strings enviadas nao e propriedade de uma senha. Divergencia e 400 de forma.
 */
export const signupBody = z.object({
  email: z.string().trim().min(3).max(320).refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "invalid email"),
  phone: z.string().max(32).transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) ctx.addIssue({ code: "custom", message: "invalid phone" });
    return normalized ?? "";
  }),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(1024),
  passwordConfirmation: z.string().min(1).max(1024),
}).strict().refine((body) => body.password === body.passwordConfirmation, { message: "password confirmation mismatch", path: ["passwordConfirmation"] });

@Controller("auth")
export class SignupController {
  constructor(@Inject(SignupUseCase) private readonly signup: SignupUseCase) {}

  @Post("signup")
  @UseGuards(BearerAuthGuard)
  @AcceptTokenKinds("signup")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentActor() actor: SignupActor, @Req() request: Request) {
    const value = parseRequest(signupBody, body);
    return this.signup.execute({ actor, email: value.email, phone: value.phone, name: value.name, password: value.password, context: request.context ?? ANONYMOUS_CONTEXT });
  }
}
