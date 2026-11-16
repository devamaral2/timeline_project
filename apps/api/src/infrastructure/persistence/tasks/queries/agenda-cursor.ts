export interface AgendaCursor {
  startedAt: Date;
  id: string;
}

export function encodeAgendaCursor(cursor: AgendaCursor): string {
  const payload = JSON.stringify({ startedAt: cursor.startedAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeAgendaCursor(value: string): AgendaCursor {
  try {
    const payload = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(payload) as { startedAt: string; id: string };
    const startedAt = new Date(parsed.startedAt);
    if (
      typeof parsed.id !== "string" ||
      !parsed.id ||
      Number.isNaN(startedAt.getTime())
    ) {
      throw new Error("malformed");
    }
    return { startedAt, id: parsed.id };
  } catch {
    throw new Error("Invalid agenda cursor");
  }
}
