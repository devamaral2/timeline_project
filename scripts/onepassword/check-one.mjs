import { resolveOnePasswordSecret } from "./loader.mjs";

const key = process.argv.slice(2).find((argument) => argument !== "--") ?? "AUTH_KEY_ENCRYPTION_KEY";

try {
  await resolveOnePasswordSecret(key);
  console.log(`[1Password] variável encontrada: ${key}`);
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : "[1Password] falha ao consultar a variável");
  process.exit(1);
}
