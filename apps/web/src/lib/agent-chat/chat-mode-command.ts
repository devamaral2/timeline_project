const HERMES_COMMAND = /^\/hermes(?:\s+([\s\S]+))?$/i;
const LEAVE_COMMAND = /^\/(?:app|assistente|sair)$/i;

/**
 * Comandos de modo do chat. `/hermes` entra no modo Hermes (com uma mensagem, ja a envia); `/app` volta ao
 * assistente da agenda. Qualquer outro texto nao e comando: devolve `null`.
 */
export type ChatModeCommand = { kind: "hermes"; text: string | null } | { kind: "leave" };

export function parseChatCommand(text: string): ChatModeCommand | null {
  const trimmed = text.trim();
  const hermes = HERMES_COMMAND.exec(trimmed);
  if (hermes) return { kind: "hermes", text: hermes[1]?.trim() || null };
  if (LEAVE_COMMAND.test(trimmed)) return { kind: "leave" };
  return null;
}
