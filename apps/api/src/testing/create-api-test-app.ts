import "reflect-metadata";
import type { LoggerService } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES } from "@repo/contracts/device-key";
import { AppModule } from "../app.module";
import { DomainExceptionFilter } from "../nest/domain-exception.filter";
import { configureApiDocumentation } from "../nest/openapi";
import { DAILY_READING_BODY_LIMIT_BYTES } from "../features/save-daily-reading/save-daily-reading.controller";

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
  close(): Promise<void>;
}

export type ApiTestEnv = Record<string, string>;

/**
 * Sobe a API como o `main.ts` sobe: o mesmo parser de corpo com o teto da maior
 * rota, o mesmo filtro global de erros e a mesma documentação. O único ajuste é
 * o logger silencioso, para a saída do Vitest ficar limpa.
 */
export async function createApiTestApp(env: ApiTestEnv): Promise<ApiTestApp> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    app.useBodyParser("json", {
      limit: Math.max(DAILY_READING_BODY_LIMIT_BYTES, TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES),
    });
    app.useGlobalFilters(new DomainExceptionFilter(silentLogger));
    configureApiDocumentation(app);
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("O servidor de teste não expôs uma porta TCP");

    return {
      url: `http://127.0.0.1:${address.port}`,
      app,
      close: async () => {
        await app.close();
        for (const [key, value] of previous) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      },
    };
  } catch (error) {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    throw error;
  }
}
