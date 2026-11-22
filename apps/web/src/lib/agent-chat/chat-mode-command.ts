import type { ModelProvider } from "@repo/contracts";

const AGENT_COMMAND = /^\/(hermes|modelo|claude|openai|openrouter)(?:\s+([\s\S]+))?$/i;
const LEAVE_COMMAND = /^\/(?:app|assistente|sair)$/i;

/** O provedor que cada comando de modelo ja escolhe; `/modelo` nao escolhe nenhum e mantem o salvo. */
const COMMAND_PROVIDERS: Record<string, ModelProvider | null> = {
  modelo: null,
  claude: "anthropic",
  openai: "openai",
  openrouter: "openrouter",
};

/** Os agentes que o chat atende por modo: o Hermes (ADR 004) e o modelo que o usuario escolhe (ADR 0019). */
export type ChatAgent = "hermes" | "model";

/**
 * Comandos de modo do chat. `/hermes` entra no modo do Hermes; `/modelo`, `/claude`, `/openai` e `/openrouter` entram
 * no modo modelo (os tres ultimos ja escolhem o provedor). Com uma mensagem depois, ja a enviam. `/app` volta ao
 * assistente da agenda. Qualquer outro texto nao e comando: devolve `null`.
 */
export type ChatModeCommand =
  | { kind: "agent"; agent: "hermes"; text: string | null }
  | { kind: "agent"; agent: "model"; provider: ModelProvider | null; text: string | null }
  | { kind: "leave" };

export function parseChatCommand(text: string): ChatModeCommand | null {
  const trimmed = text.trim();
  const match = AGENT_COMMAND.exec(trimmed);
  if (match) {
    const name = match[1].toLowerCase();
    const rest = match[2]?.trim() || null;
    if (name === "hermes") return { kind: "agent", agent: "hermes", text: rest };
    return { kind: "agent", agent: "model", provider: COMMAND_PROVIDERS[name] ?? null, text: rest };
  }
  if (LEAVE_COMMAND.test(trimmed)) return { kind: "leave" };
  return null;
}
