import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./common/domain-exception.filter";
import { getServerEnv, isLoopbackHost } from "./config/env";
import { loadRootEnv } from "./config/load-env";

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

  const { PORT, API_HOST } = getServerEnv();
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new DomainExceptionFilter());

  // O React Native nao aplica a politica de origem, entao o app no celular nao
  // precisa disso. Quem precisa e o alvo web do Expo, util para depurar telas
  // no navegador — e ele so existe quando a API ja esta aberta na rede.
  if (!isLoopbackHost(API_HOST)) app.enableCors();

  await app.listen(PORT, API_HOST);
  Logger.log(`API ouvindo em http://${API_HOST}:${PORT}`, "Bootstrap");
}

void bootstrap();
