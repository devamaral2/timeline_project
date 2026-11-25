import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./common/domain-exception.filter";
import { configureApiDocumentation } from "./common/openapi";
import { getDatabaseEnv, getServerEnv, isLoopbackHost } from "./config/env";
import { loadRootEnv } from "./config/load-env";
import { DAILY_READING_BODY_LIMIT_BYTES } from "./features/save-daily-reading/save-daily-reading.controller";

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
  // criar o Nest, evita subir o processo so para falhar no primeiro request.
  getDatabaseEnv();

  const { API_PORT, API_HOST } = getServerEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // O markdown de uma pagina lida passa dos 100 kB padrao. A API so ouve o
  // gateway, que ja segura as demais rotas no teto dele; aqui o teto e um so.
  app.useBodyParser("json", { limit: DAILY_READING_BODY_LIMIT_BYTES });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();
  configureApiDocumentation(app);

  // Clientes nativos nao aplicam a politica de origem. Quem precisa e o alvo
  // web, util para depurar telas no navegador — e ele so existe quando a API
  // ja esta aberta na rede.
  if (!isLoopbackHost(API_HOST)) app.enableCors();

  await app.listen(API_PORT, API_HOST);
  Logger.log(`API ouvindo em http://${API_HOST}:${API_PORT}`, "Bootstrap");
}

void bootstrap();
