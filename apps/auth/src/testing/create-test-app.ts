import { Controller, Get, Req, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { AppModule } from "../app.module";
import { getRuntimeEnv, type EnvSource } from "../config/env";
import { configureHttpShell } from "../http/request-context.middleware";

@Controller("testing")
class TestContextController {
  @Get("request-context")
  requestContext(@Req() request: Request) {
    return request.context;
  }
}

export interface TestApp {
  url: string;
  app: INestApplication;
  close(): Promise<void>;
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

export async function createTestApp(overrides: EnvSource = {}): Promise<TestApp> {
  const module = await Test.createTestingModule({
    imports: [AppModule.forRoot(testEnv(overrides))],
    controllers: [TestContextController],
  }).compile();
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
