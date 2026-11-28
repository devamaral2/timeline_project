import "reflect-metadata";
import type { LoggerService } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { API_BODY_LIMIT_BYTES } from "../config/body-limits";
import { isLoopbackHost } from "../config/env";
import { AppModule } from "../app.module";
import { DomainExceptionFilter } from "../nest/domain-exception.filter";
import { configureApiDocumentation } from "../nest/openapi";
import { createApiRuntime, type ApiRuntime } from "../server/composition-root";
import { delegateToFastify } from "../server/coexistence";

/** O Logger do filtro escreveria direto no stdout e escaparia do `silent` do Vitest. */
const silentLogger: LoggerService = {
  log() {},
  error() {},
  warn() {},
  debug() {},
  verbose() {},
  fatal() {},
};

export interface ApiTestApp {
  url: string;
  app: NestExpressApplication;
  runtime: ApiRuntime;
  close(): Promise<void>;
}

export type ApiTestEnv = Record<string, string>;

/**
 * Sobe a API como o `main.ts` sobe: o mesmo parser de corpo com o teto da maior
 * rota, o mesmo filtro global de erros, a mesma documentacao e o mesmo Fastify
 * em coexistencia com as rotas Nest restantes. O unico ajuste e o logger
 * silencioso, para a saida do Vitest ficar limpa.
 */
export async function createApiTestApp(env: ApiTestEnv): Promise<ApiTestApp> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  const restoreEnv = (): void => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  let runtime: ApiRuntime | undefined;
  try {
    runtime = await createApiRuntime({
      databaseUrl: env.DATABASE_URL,
      authInternalServiceKey: env.AUTH_INTERNAL_SERVICE_KEY,
      logger: { warn() {}, error() {} },
    });
    await runtime.start();

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    if (!isLoopbackHost(env.API_HOST ?? "127.0.0.1")) app.enableCors();
    delegateToFastify(app.getHttpAdapter().getInstance(), runtime.fastify, runtime.routes);
    app.useBodyParser("json", { limit: API_BODY_LIMIT_BYTES });
    app.useGlobalFilters(new DomainExceptionFilter(silentLogger));
    configureApiDocumentation(app);
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("O servidor de teste não expôs uma porta TCP");

    return {
      url: `http://127.0.0.1:${address.port}`,
      app,
      runtime,
      close: async () => {
        await app.close();
        await runtime?.close();
        restoreEnv();
      },
    };
  } catch (error) {
    await runtime?.close();
    restoreEnv();
    throw error;
  }
}
