import { Controller, Get, HttpException, HttpStatus, Req, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { AppModule } from "../app.module";
import { getRuntimeEnv, type EnvSource } from "../config/env";
import { HttpPwnedPasswordsGateway } from "../credentials/http-pwned-passwords.gateway";
import type { PwnedPasswordsGateway } from "../credentials/pwned-passwords.gateway";
import { configureHttpShell } from "../http/request-context.middleware";

@Controller("testing")
class TestContextController {
  @Get("request-context")
  requestContext(@Req() request: Request) {
    return request.context;
  }

  @Get("generic-rate-limit")
  genericRateLimit(): never {
    throw new HttpException("rate limited", HttpStatus.TOO_MANY_REQUESTS);
  }
}

export interface TestApp {
  url: string;
  app: INestApplication;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /**
   * O gateway do HIBP e o unico provider que sai para a internet num teste.
   * Por isso ele e trocado por padrao: sem isso todo teste que aceita convite
   * ou troca senha bateria em api.pwnedpasswords.com. Quem precisa do caminho
   * de falha (503) passa um dublê que rejeita.
   */
  pwnedPasswords?: PwnedPasswordsGateway;
}

function testEnv(overrides: EnvSource = {}) {
  return getRuntimeEnv({
    NODE_ENV: "test",
    AUTH_DATABASE_URL: "postgres://runtime",
    AUTH_ISSUER: "https://auth.example.test",
    AUTH_PUBLIC_URL: "https://auth.example.test",
    AUTH_WEB_APP_URL: "https://web.example.test",
    AUTH_KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    AUTH_OTP_PROVIDER: "fake",
    AUTH_ALLOW_FAKE_OTP: "true",
    ...overrides,
  });
}

export async function createTestApp(overrides: EnvSource = {}, options: TestAppOptions = {}): Promise<TestApp> {
  const module = await Test.createTestingModule({
    imports: [AppModule.forRoot(testEnv(overrides))],
    controllers: [TestContextController],
  })
    .overrideProvider(HttpPwnedPasswordsGateway)
    .useValue(options.pwnedPasswords ?? { isCompromised: async () => false })
    .compile();
  const app = module.createNestApplication({ bodyParser: false });
  configureHttpShell(app);
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address");

  return {
    url: `http://127.0.0.1:${address.port}`,
    app,
    close: () => app.close(),
  };
}
