import { spawn } from "node:child_process";
import { loadOnePasswordEnvironment } from "./loader.mjs";

const argv = process.argv.slice(2);
if (argv[0] === "--") argv.shift();
const [command, ...args] = argv;
if (!command) {
  console.error("Uso: pnpm secrets:exec -- <comando> [args...]");
  process.exit(2);
}

try {
  const { env } = await loadOnePasswordEnvironment();
  const child = spawn(command, args, { env, stdio: "inherit" });

  const forward = (signal) => child.kill(signal);
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));

  child.on("error", (cause) => {
    console.error(`[1Password] não foi possível iniciar '${command}': ${cause.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : `[1Password] ${cause}`);
  process.exit(1);
}
