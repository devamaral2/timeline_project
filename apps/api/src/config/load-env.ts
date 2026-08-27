import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Carrega o `.env` da raiz do monorepo. O Nest, ao contrario do Next, nao le
 * arquivos .env sozinho — e as duas aplicacoes compartilham o mesmo arquivo na
 * raiz para nao duplicar segredos.
 *
 * A ordem e proposital: `process.loadEnvFile` NAO sobrescreve variaveis ja
 * definidas, entao carregar `.env.local` primeiro faz com que ele tenha
 * precedencia sobre `.env` — a mesma convencao do Next. O ambiente real do
 * shell continua ganhando de ambos.
 */
export function loadRootEnv(from: string = resolve(__dirname, "../../../..")): void {
  for (const fileName of [".env.local", ".env"]) {
    const path = resolve(from, fileName);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
