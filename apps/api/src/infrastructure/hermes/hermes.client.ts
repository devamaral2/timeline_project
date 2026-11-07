import { RetryableAiJobError } from "../ai-jobs/ai-jobs.service";

export interface HermesChatInput {
  text: string;
  /** Identifica a conversa no Hermes: a mesma sessao continua o assunto e a memoria dele. */
  sessionId: string;
  signal?: AbortSignal;
}

/** O que a fila de jobs precisa do Hermes: uma mensagem entra, o texto da resposta sai. */
export interface HermesChat {
  chat(input: HermesChatInput): Promise<{ text: string }>;
}

export interface HermesClientConfig {
  url: string;
  apiKey: string | undefined;
  /** Uma resposta do Hermes pode incluir modelo e ferramentas; o padrao cobre o pior caso comum. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Configuracao ausente ou resposta recusada: repetir nao ajuda. */
export class HermesRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "HermesRequestError";
  }
}

const DEFAULT_TIMEOUT_MS = 150_000;

/** Fala com a API OpenAI-compativel do Hermes (`POST /v1/chat/completions`), sempre pela rede interna. */
export class HermesClient implements HermesChat {
  constructor(private readonly config: HermesClientConfig) {}

  async chat({ text, sessionId, signal }: HermesChatInput): Promise<{ text: string }> {
    if (!this.config.apiKey) throw new HermesRequestError("HERMES_API_KEY is not configured");
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await (this.config.fetch ?? fetch)(`${this.config.url.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
        "x-hermes-session-id": sessionId,
      },
      body: JSON.stringify({ model: "hermes-agent", stream: false, messages: [{ role: "user", content: text }] }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      // O Hermes pode ter agido (criado entidades) antes de estourar o tempo: repetir o turno repetiria as acoes.
      if (timeout.aborted && !signal?.aborted) throw new HermesRequestError("Hermes timed out");
      throw error;
    }

    if (!response.ok) {
      // So 429 e 503 (nao atendeu) valem uma nova tentativa da fila. Outro 5xx pode vir depois de o Hermes agir,
      // e 4xx e erro de configuracao ou de pedido.
      const message = `Hermes responded ${response.status}`;
      if (response.status === 429 || response.status === 503) throw new RetryableAiJobError(message);
      throw new HermesRequestError(message, response.status);
    }
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new HermesRequestError("Hermes returned no text");
    return { text: content };
  }
}

/** O id de sessao do Hermes por conversa do app; so caracteres seguros para um cabecalho. */
export function hermesSessionId(userId: string, conversationId: string | undefined): string {
  return `braid-${userId}-${conversationId ?? "main"}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
}
