import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { parseRequest } from "./validation";
import type { Request } from "express";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { LoginUseCase } from "../authentication/usecases/login.usecase";
const loginBody = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024) }).strict();
@Controller("auth") export class PublicAuthController {
  constructor(@Inject(LoginUseCase) private readonly login:LoginUseCase) {}
  private context(request:Request){ return request.context ?? ANONYMOUS_CONTEXT; }
  /** 200, e nao 202: nao ha mais desafio pendente, a resposta ja e a sessao. */
  @Post("login") @HttpCode(HttpStatus.OK) async signIn(@Body() body:unknown,@Req() request:Request){const value=parseRequest(loginBody,body);return this.login.execute({email:value.email,password:value.password,context:this.context(request)});}
}
