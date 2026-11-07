import type { McpConfig } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fala com a API como o gateway de autenticacao falaria: a identidade vai nos
 * cabecalhos `x-auth-*`, sempre a do dono. Nenhuma ferramenta escolhe o usuario.
 */
export class ApiClient {
  constructor(
    private readonly config: Pick<McpConfig, "API_SERVICE_URL" | "AUTH_INTERNAL_SERVICE_KEY" | "MCP_OWNER_USER_ID">,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async post<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
    return this.request<T>("POST", path, { body, idempotencyKey });
  }

  /** Edicao com `expectedRevision` no corpo: repetir a chamada falha por revisao, entao nao precisa de chave. */
  async patch(path: string, body: unknown): Promise<{ ok: true }> {
    await this.request<undefined>("PATCH", path, { body });
    return { ok: true };
  }

  async get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) search.set(key, String(value));
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return this.request<T>("GET", `${path}${suffix}`, {});
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    options: { body?: unknown; idempotencyKey?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      "x-auth-gateway-key": this.config.AUTH_INTERNAL_SERVICE_KEY,
      "x-auth-user-id": this.config.MCP_OWNER_USER_ID,
      accept: "application/json",
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

    const response = await this.fetchImpl(`${this.config.API_SERVICE_URL}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, describeFailure(response.status, text));
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** A mensagem da API volta ao modelo para ele corrigir a chamada; nunca inclui cabecalhos ou chaves. */
function describeFailure(status: number, text: string): string {
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    const message = Array.isArray(parsed.message) ? parsed.message.join("; ") : parsed.message;
    if (message) return `API ${status}: ${message}`;
  } catch {
    // Corpo que nao e JSON: cai na mensagem generica.
  }
  return `API ${status}`;
}
