import { RetryableJobError } from "../jobs/jobs.service";
import type { AgentTraceDto } from "@repo/contracts";
import { HermesTraceTracker, type HermesTraceEvent } from "./hermes-trace";

export interface HermesChatInput {
  text: string;
  /** Identifica a sessao no Hermes: a mesma sessao continua o assunto e a memoria dele. */
  sessionId: string;
  signal?: AbortSignal;
  /** Chamado a cada mudanca no rastro do turno (ferramentas, pensamentos) enquanto o Hermes trabalha. */
  onTrace?(trace: AgentTraceDto): void;
}

export interface HermesReply {
  text: string;
  trace: AgentTraceDto;
}

/** O que a fila de jobs precisa do Hermes: uma mensagem entra; o rastro sai durante o turno e o texto no fim. */
export interface HermesChat {
  chat(input: HermesChatInput): Promise<HermesReply>;
}

export interface HermesClientConfig {
  url: string;
  apiKey: string | undefined;
  /** Uma resposta do Hermes pode incluir modelo e ferramentas; o padrao cobre o pior caso comum. */
  timeoutMs?: number;
  /** De quanto em quanto tempo consulta o resultado quando o stream de eventos cai. */
  pollMs?: number;
  fetch?: typeof fetch;
}

/** Configuracao ausente ou resposta recusada: repetir nao ajuda. */
export class HermesRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "HermesRequestError";
  }
}

/** O Hermes devolveu a execucao como cancelada ou interrompida: o pedido termina `interrupted`, nao `failed`. */
export class HermesRunInterruptedError extends HermesRequestError {
  constructor(message: string, status?: number) {
    super(message, status);
    this.name = "HermesRunInterruptedError";
  }
}

const DEFAULT_TIMEOUT_MS = 150_000;
const DEFAULT_POLL_MS = 1_000;
const TERMINAL = new Set(["completed", "failed", "cancelled", "interrupted"]);
const INTERRUPTED = new Set(["cancelled", "interrupted"]);

interface RunEvent {
  event?: unknown;
  error?: unknown;
  output?: unknown;
}

/**
 * Fala com o Hermes pela API de runs (`POST /v1/runs` + `GET /v1/runs/{id}/events`), sempre pela rede interna.
 * Os eventos de ferramenta e de raciocinio viram o rastro que o chat mostra.
 */
export class HermesClient implements HermesChat {
  constructor(private readonly config: HermesClientConfig) {}

  async chat({ text, sessionId, signal, onTrace }: HermesChatInput): Promise<HermesReply> {
    if (!this.config.apiKey) throw new HermesRequestError("HERMES_API_KEY is not configured");
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    // Ate aqui o Hermes ainda nao agiu: uma falha de conexao pode ser repetida pela fila.
    const trace = new HermesTraceTracker(text);
    const runId = await this.start(text, sessionId, combined, timeout, signal);

    // Depois de iniciada, nada e repetido: o Hermes pode ter criado ou editado entidades. Toda falha vira definitiva.
    try {
      return await this.follow(runId, combined, trace, onTrace);
    } catch (error) {
      void this.stop(runId);
      // O rastro fecha com a falha: e o ultimo estado que o chat ve antes de o pedido falhar.
      const reason = signal?.aborted ? "A execução foi cancelada."
        : error instanceof HermesRequestError ? error.message
          : timeout.aborted ? "Hermes timed out" : "Lost the connection to Hermes";
      onTrace?.(trace.finish({ error: reason }));
      if (signal?.aborted) throw error;
      if (error instanceof HermesRequestError) throw error;
      throw new HermesRequestError(reason);
    }
  }

  private async start(text: string, sessionId: string, signal: AbortSignal, timeout: AbortSignal, outer?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await this.request("POST", "/v1/runs", signal, { input: text, session_id: sessionId });
    } catch (error) {
      if (timeout.aborted && !outer?.aborted) throw new HermesRequestError("Hermes timed out");
      throw error;
    }
    if (!response.ok) {
      // So 429 e 503 (nao atendeu) valem uma nova tentativa da fila; o resto e erro de configuracao ou de pedido.
      const message = `Hermes responded ${response.status}`;
      if (response.status === 429 || response.status === 503) throw new RetryableJobError(message);
      throw new HermesRequestError(message, response.status);
    }
    const body = (await response.json()) as { run_id?: unknown };
    if (typeof body.run_id !== "string" || !body.run_id) throw new HermesRequestError("Hermes returned no run id");
    return body.run_id;
  }

  private async follow(
    runId: string,
    signal: AbortSignal,
    trace: HermesTraceTracker,
    onTrace?: (trace: AgentTraceDto) => void,
  ): Promise<HermesReply> {
    let output: string | undefined;
    let failure: string | undefined;
    let interrupted = false;

    try {
      const events = await this.request("GET", `/v1/runs/${encodeURIComponent(runId)}/events`, signal);
      if (!events.ok || !events.body) throw new HermesRequestError(`Hermes events responded ${events.status}`);
      for await (const raw of sseData(events.body)) {
        const event = raw as RunEvent;
        if (trace.apply(raw as HermesTraceEvent)) onTrace?.(trace.snapshot());
        if (event.event === "run.completed" && typeof event.output === "string") output = event.output;
        if (event.event === "run.failed") failure = typeof event.error === "string" ? event.error : "Hermes run failed";
        if (event.event === "run.cancelled" || event.event === "run.interrupted") {
          failure = "Hermes run was cancelled";
          interrupted = true;
        }
      }
    } catch (error) {
      if (signal.aborted) throw error;
      // O stream caiu no meio: o resultado ainda esta no Hermes e se le por consulta.
    }

    if (failure) throw interrupted ? new HermesRunInterruptedError(failure) : new HermesRequestError(failure);
    if (output === undefined) output = await this.pollOutput(runId, signal);
    return { text: output, trace: trace.finish({ output }) };
  }

  private async pollOutput(runId: string, signal: AbortSignal): Promise<string> {
    for (;;) {
      signal.throwIfAborted();
      const response = await this.request("GET", `/v1/runs/${encodeURIComponent(runId)}`, signal);
      if (!response.ok) throw new HermesRequestError(`Hermes status responded ${response.status}`);
      const run = (await response.json()) as { status?: unknown; output?: unknown; error?: unknown };
      if (typeof run.status === "string" && TERMINAL.has(run.status)) {
        if (run.status === "completed" && typeof run.output === "string") return run.output;
        const message = typeof run.error === "string" ? run.error : `Hermes run ${run.status}`;
        throw INTERRUPTED.has(run.status) ? new HermesRunInterruptedError(message) : new HermesRequestError(message);
      }
      await sleep(this.config.pollMs ?? DEFAULT_POLL_MS, signal);
    }
  }

  /** Melhor esforco: pedir ao Hermes que pare uma execucao que o app ja nao espera. */
  private async stop(runId: string): Promise<void> {
    try {
      await this.request("POST", `/v1/runs/${encodeURIComponent(runId)}/stop`, AbortSignal.timeout(5_000), {});
    } catch {
      // Nada a fazer: o proprio Hermes limita a duracao da execucao.
    }
  }

  private request(method: "GET" | "POST", path: string, signal: AbortSignal, body?: unknown): Promise<Response> {
    return (this.config.fetch ?? fetch)(`${this.config.url.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        accept: method === "GET" && path.endsWith("/events") ? "text/event-stream" : "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  }
}

/** Le os `data:` de um stream SSE, um objeto JSON por quadro; comentarios (`: keepalive`) e quadros invalidos saem. */
async function* sseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) {
        try {
          yield JSON.parse(data);
        } catch {
          // Quadro que nao e JSON: ignora.
        }
      }
      end = buffer.indexOf("\n\n");
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** O id de sessao do Hermes por sessao do app (o primeiro pedido dela); so caracteres seguros para um cabecalho. */
export function hermesSessionId(userId: string, firstRequestId: string): string {
  return `braid-${userId}-${firstRequestId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
}
