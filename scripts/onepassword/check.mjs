import { loadOnePasswordEnvironment } from "./loader.mjs";

try {
  const { keys, environmentId } = await loadOnePasswordEnvironment();
  console.log(`[1Password] acesso confirmado ao Environment '${environmentId}'`);
  console.log(`[1Password] ${keys.length} variáveis resolvidas: ${keys.join(", ")}`);
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : `[1Password] ${cause}`);
  process.exit(1);
}
