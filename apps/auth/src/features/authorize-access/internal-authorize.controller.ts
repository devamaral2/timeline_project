import { timingSafeEqual } from "node:crypto";
import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthenticationFailedError } from "../../common/errors";
import { RUNTIME_ENV } from "../../config/tokens";
import type { RuntimeEnv } from "../../config/env";
import { BearerAuthGuard } from "../authenticate-user/http/bearer-auth.guard";
import { CurrentActor } from "../authenticate-user/http/current-actor.decorator";
import { parseRequest } from "../../http/validation";
import type { AuthenticatedActor } from "../../domain/users/user";
import { ACCESS_ACTIONS, ACCESS_RESOURCES, AuthorizeAccessUseCase } from "./authorize-access.usecase";

const requestBody = z.object({
  resource: z.enum(ACCESS_RESOURCES),
  action: z.enum(ACCESS_ACTIONS),
  targetUserId: z.string().min(1).max(128).optional(),
}).strict();
const sessionBody = requestBody.extend({
  userId: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128),
});

@Controller("auth/internal")
export class InternalAuthorizeController {
  constructor(
    @Inject(AuthorizeAccessUseCase) private readonly authorize: AuthorizeAccessUseCase,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
  ) {}

  private verifyServiceKey(presented: string | undefined): void {
    const expected = this.env.internalServiceKey;
    if (!expected || !presented) throw new AuthenticationFailedError("internal service key missing");
    const expectedBytes = Buffer.from(expected);
    const presentedBytes = Buffer.from(presented);
    if (expectedBytes.length !== presentedBytes.length || !timingSafeEqual(expectedBytes, presentedBytes)) {
      throw new AuthenticationFailedError("invalid internal service key");
    }
  }

  @Post("authorize")
  @UseGuards(BearerAuthGuard)
  @HttpCode(HttpStatus.OK)
  async bearer(
    @Body() body: unknown,
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("x-auth-service-key") key: string | undefined,
  ) {
    this.verifyServiceKey(key);
    const value = parseRequest(requestBody, body);
    return this.authorize.execute({ ...value, userId: actor.userId, sessionId: actor.sessionId });
  }

  @Post("authorize-session")
  @HttpCode(HttpStatus.OK)
  async session(@Body() body: unknown, @Headers("x-auth-service-key") key: string | undefined) {
    this.verifyServiceKey(key);
    return this.authorize.execute(parseRequest(sessionBody, body));
  }
}
