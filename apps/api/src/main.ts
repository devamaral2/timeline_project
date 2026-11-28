import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { API_BODY_LIMIT_BYTES } from "./config/body-limits";
import { DomainExceptionFilter } from "./nest/domain-exception.filter";
import { configureApiDocumentation } from "./nest/openapi";
import { getDatabaseEnv, getServerEnv, isLoopbackHost } from "./config/env";
import { loadRootEnv } from "./config/load-env";
import { createApiRuntime } from "./server/composition-root";
import { delegateToFastify } from "./server/coexistence";

/**
 * Bind em 127.0.0.1 por padrao: em producao o backend nao e exposto para fora
 * do servidor, e quem fala com ele e o Next, na mesma maquina, via rewrite de
 * /api/*.
 *
 * `API_HOST=0.0.0.0` abre a API para a rede local. E o modo de desenvolvimento
 * do app mobile: o celular nao consegue alcancar o loopback da sua maquina.
 */
async function bootstrap(): Promise<void> {
  // Antes de qualquer coisa que leia process.env — os gateways resolvem as
  // chaves do OpenRouter no construtor, durante a criacao dos providers.
  loadRootEnv();

  // DATABASE_URL passa a ser obrigatorio a partir daqui: falhar cedo, antes de
  // criar o servidor, evita subir o processo so para falhar no primeiro request.
  const databaseUrl = getDatabaseEnv().DATABASE_URL;

  const { API_PORT, API_HOST, AUTH_INTERNAL_SERVICE_KEY } = getServerEnv();
  const runtime = await createApiRuntime({ databaseUrl, authInternalServiceKey: AUTH_INTERNAL_SERVICE_KEY });
  await runtime.start();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Clientes nativos nao aplicam a politica de origem. Quem precisa e o alvo
  // web, util para depurar telas no navegador — e ele so existe quando a API
  // ja esta aberta na rede. O CORS roda antes da delegacao e da autenticacao.
  if (!isLoopbackHost(API_HOST)) app.enableCors();
  delegateToFastify(app.getHttpAdapter().getInstance(), runtime.fastify, runtime.routes);
  // O markdown de uma pagina lida e a entrega do servico de transcricao passam
  // dos 100 kB padrao. A API so ouve o gateway, que ja segura cada rota no teto
  // dela; aqui o teto e um so, o da maior (a entrega).
  app.useBodyParser("json", { limit: API_BODY_LIMIT_BYTES });
  app.useGlobalFilters(new DomainExceptionFilter());
  configureApiDocumentation(app);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  await app.listen(API_PORT, API_HOST);
  Logger.log(`API ouvindo em http://${API_HOST}:${API_PORT}`, "Bootstrap");
}

void bootstrap();
