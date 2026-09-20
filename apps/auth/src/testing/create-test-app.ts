import { Controller, Get, HttpException, HttpStatus, Param, Req, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { AppModule } from "../app.module";
import { AccessDeniedError, AuthenticationFailedError, ConflictError, NotFoundError, RateLimitedError, RequiredDependencyUnavailableError, SemanticInputError } from "../common/errors";
import { RecordingAuthLogger } from "../common/logger";
import { getRuntimeEnv, type EnvSource } from "../config/env";
import { HttpPwnedPasswordsGateway } from "../credentials/http-pwned-passwords.gateway";
import type { PwnedPasswordsGateway } from "../credentials/pwned-passwords.gateway";
import { configureHttpShell } from "../http/request-context.middleware";
import { configureApiDocumentation } from "../http/openapi";

/** O segredo que os testes de redacao procuram na resposta. */
export const LEAK_PROBE = "leak-probe-9d3f";

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

  /**
   * Uma rota por ramo do filtro. Cada erro carrega `LEAK_PROBE` no lugar que
   * nunca pode sair na resposta -- `internalReason`, `message` ou `cause`.
   */
  @Get("raise/:kind")
  raise(@Param("kind") kind: string): never {
    switch (kind) {
      case "authentication": throw new AuthenticationFailedError(`unknown email ${LEAK_PROBE}`);
      case "access": throw new AccessDeniedError(`missing permission ${LEAK_PROBE}`);
      case "rate-limit": throw new RateLimitedError(42.3, `too many tries ${LEAK_PROBE}`);
      case "semantic": throw new SemanticInputError("password_compromised");
      case "conflict": throw new ConflictError("would_remove_last_admin");
      case "not-found": throw new NotFoundError(`no such user ${LEAK_PROBE}`);
      case "dependency": throw new RequiredDependencyUnavailableError(`provider down ${LEAK_PROBE}`);
      default: throw new Error(`unhandled failure ${LEAK_PROBE}`);
    }
  }
}

export interface TestApp {
  url: string;
  app: INestApplication;
  logger: RecordingAuthLogger;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /**
   * O gateway do HIBP e o unico provider que sai para a internet num teste.
   * Por isso ele e trocado por padrao: sem isso todo teste que aceita convite
   * ou troca senha bateria em api.pwnedpasswords.com. Quem precisa do caminho
   * de falha (503), ou do gateway real contra um servidor fake, passa o seu.
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
  // O logger do filtro guarda o evento em memoria em vez de imprimir: o Logger
  // do Nest escapa do `silent` do Vitest e sujaria a saida do `test:ai`.
  const logger = new RecordingAuthLogger();
  configureHttpShell(app, logger);
  configureApiDocumentation(app);
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address");

  return {
    url: `http://127.0.0.1:${address.port}`,
    app,
    logger,
    close: () => app.close(),
  };
}
