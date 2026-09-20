import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { z } from "zod";
import type { Request } from "express";
import { parseRequest } from "../../../http/validation";
import { ANONYMOUS_CONTEXT } from "../../../common/request-context";
import { LoginWithPasswordUseCase } from "../usecases/login-with-password.usecase";

const loginBody = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024) }).strict();

@Controller("auth")
export class LoginWithPasswordController {
  constructor(
    @Inject(LoginWithPasswordUseCase) private readonly login: LoginWithPasswordUseCase,
  ) {}

  private context(request: Request) { return request.context ?? ANONYMOUS_CONTEXT; }

  @Post("login")
  async loginWithPassword(@Body() body: unknown, @Req() request: Request) {
    const value = parseRequest(loginBody, body);
    return this.login.execute({ ...value, context: this.context(request) });
  }
}
