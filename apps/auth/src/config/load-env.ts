import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EnvSource } from "./env";

function parseEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const entries: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

/** Shell values win over .env.local, which wins over .env. */
export function loadRootEnv(rootDir: string, processEnv: EnvSource): EnvSource {
  return Object.freeze({
    ...parseEnvFile(resolve(rootDir, ".env")),
    ...parseEnvFile(resolve(rootDir, ".env.local")),
    ...processEnv,
  });
}
