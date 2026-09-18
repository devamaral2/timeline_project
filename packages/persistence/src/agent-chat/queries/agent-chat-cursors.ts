export interface AgentConversationCursor {
  lastMessageAt: Date;
  id: string;
}

export function encodeAgentConversationCursor(cursor: AgentConversationCursor): string {
  const payload = JSON.stringify({
    lastMessageAt: cursor.lastMessageAt.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeAgentConversationCursor(value: string): AgentConversationCursor {
  try {
    const payload = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(payload) as { lastMessageAt: string; id: string };
    const lastMessageAt = new Date(parsed.lastMessageAt);
    if (typeof parsed.id !== "string" || !parsed.id || Number.isNaN(lastMessageAt.getTime())) {
      throw new Error("malformed");
    }
    return { lastMessageAt, id: parsed.id };
  } catch {
    throw new Error("Invalid conversation cursor");
  }
}

/**
 * A pagina de mensagens caminha para tras dentro de uma conversa, e `seq` ja e
 * unico e monotonico ali: um numero basta como cursor.
 */
export function encodeAgentChatMessageCursor(seq: number): string {
  return Buffer.from(JSON.stringify({ seq }), "utf8").toString("base64url");
}

export function decodeAgentChatMessageCursor(value: string): number {
  try {
    const payload = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(payload) as { seq: number };
    if (!Number.isInteger(parsed.seq) || parsed.seq < 1) throw new Error("malformed");
    return parsed.seq;
  } catch {
    throw new Error("Invalid chat message cursor");
  }
}
