import { Logger } from "./common/logger";
import { getDatabaseEnv, getServerEnv } from "./config/env";
import { loadRootEnv } from "./config/load-env";
import { createApiRuntime } from "./server/composition-root";

/**
 * Bind em 127.0.0.1 por padrao: em producao o backend nao e exposto para fora
 * do servidor, e quem fala com ele e o Next, na mesma maquina, via rewrite de
 * /api/*.
 *
 * `API_HOST=0.0.0.0` abre a API para a rede local. E o modo de desenvolvimento
 * do app mobile: o celular nao consegue alcancar o loopback da sua maquina, e
 * e nesse modo que o CORS liga.
 */
async function bootstrap(): Promise<void> {
  // Antes de qualquer coisa que leia process.env — os gateways resolvem as
  // chaves do OpenRouter no construtor, durante a criacao dos providers.
  loadRootEnv();

  // O arquivo SQLite da API (ADR 0024): o runtime o abre e aplica as migrations antes de ouvir.
  const databasePath = getDatabaseEnv().API_DATABASE_PATH;

  const { API_PORT, API_HOST, AUTH_INTERNAL_SERVICE_KEY } = getServerEnv();
  const runtime = await createApiRuntime({ databasePath, authInternalServiceKey: AUTH_INTERNAL_SERVICE_KEY });

  const shutdown = async (): Promise<void> => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  try {
    await runtime.start();
    await runtime.fastify.listen({ port: API_PORT, host: API_HOST });
  } catch (error) {
    // Uma falha no startup fecha o que ja subiu, em vez de deixar o processo de pe.
    await runtime.close().catch(() => undefined);
    throw error;
  }
  new Logger("Bootstrap").log(`API ouvindo em http://${API_HOST}:${API_PORT}`);
}

void bootstrap();
