import { ApiError, authedFetch } from "@/lib/api/authed-fetch";
import type {
  AgentChatErrorCode,
  AgentChatMessageFrame,
  AgentChatServerFrame,
  AgentChatTicketDto,
} from "@/lib/api/contracts";

/** O que so o cliente percebe: a conexao, e nao o agente, falhou. */
export type AgentChatClientFailure = "connection_lost" | "connection_failed" | "session_expired";

export type AgentChatEvent =
  | Extract<AgentChatServerFrame, { type: "status" | "reply" }>
  | { type: "error"; id: string; code: AgentChatErrorCode | AgentChatClientFailure };

/** O pedaco de `WebSocket` que o cliente usa — o bastante para trocar por um falso nos testes. */
export interface ChatSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface AgentChatClientOptions {
  /** Dono dos dados da conversa. */
  userId: string;
  onEvent(event: AgentChatEvent): void;
  fetchTicket?(userId: string): Promise<string>;
  createSocket?(url: string): ChatSocket;
  readyTimeoutMs?: number;
}

const SOCKET_OPEN = 1;
const TICKET_REJECTED = 4401;
const READY_TIMEOUT_MS = 10_000;

class TicketRejectedError extends Error {}

class ConnectionFailedError extends Error {}

/**
 * A conversa com o agente pelo WebSocket de `/api/ai/chat`.
 *
 * O socket nao carrega a sessao: antes de abri-lo, o cliente pede um ticket de
 * uso unico por `authedFetch` — que ja renova a sessao num 401 — e o socket so
 * serve depois que o servidor responde `ready`. A conexao abre na primeira
 * mensagem, e uma conexao que o servidor fechou por tempo (4001, 4002) so e
 * reaberta na proxima.
 */
export class AgentChatClient {
  private socket?: ChatSocket;
  private connecting?: Promise<ChatSocket>;
  private pendingId?: string;
  private disposed = false;

  constructor(private readonly options: AgentChatClientOptions) {}

  async send(message: Omit<AgentChatMessageFrame, "type">): Promise<void> {
    this.pendingId = message.id;
    let socket: ChatSocket;
    try {
      socket = await this.connect();
    } catch (error) {
      this.fail(message.id, error instanceof ApiError && error.status === 401 ? "session_expired" : "connection_failed");
      return;
    }
    socket.send(JSON.stringify({ type: "message", ...message }));
  }

  cancel(id: string): void {
    if (this.socket?.readyState === SOCKET_OPEN) this.socket.send(JSON.stringify({ type: "cancel", id }));
  }

  close(): void {
    this.disposed = true;
    this.pendingId = undefined;
    this.socket?.close(1000, "closed");
    this.socket = undefined;
  }

  private connect(): Promise<ChatSocket> {
    if (this.socket?.readyState === SOCKET_OPEN) return Promise.resolve(this.socket);
    this.connecting ??= this.open(true).finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  private async open(retryRejectedTicket: boolean): Promise<ChatSocket> {
    const ticket = await (this.options.fetchTicket ?? requestTicket)(this.options.userId);
    const socket = (this.options.createSocket ?? openBrowserSocket)(chatUrl(ticket));

    try {
      await waitForReady(socket, this.options.readyTimeoutMs ?? READY_TIMEOUT_MS);
    } catch (error) {
      // Um ticket recusado pode so ter expirado no caminho: vale um segundo, novo.
      if (error instanceof TicketRejectedError && retryRejectedTicket) return this.open(false);
      throw error;
    }

    if (this.disposed) {
      socket.close(1000, "closed");
      throw new ConnectionFailedError("client closed");
    }
    socket.onmessage = (event) => this.handleFrame(event.data);
    socket.onclose = () => this.handleClose(socket);
    this.socket = socket;
    return socket;
  }

  private handleFrame(data: unknown): void {
    let frame: AgentChatServerFrame;
    try {
      frame = JSON.parse(String(data)) as AgentChatServerFrame;
    } catch {
      return;
    }

    if (frame.type === "status") {
      this.options.onEvent(frame);
      return;
    }
    if (frame.type === "reply") {
      if (frame.id === this.pendingId) this.pendingId = undefined;
      this.options.onEvent(frame);
      return;
    }
    if (frame.type === "error" && frame.id) {
      if (frame.id === this.pendingId) this.pendingId = undefined;
      this.options.onEvent({ type: "error", id: frame.id, code: frame.code });
    }
  }

  private handleClose(socket: ChatSocket): void {
    if (this.socket === socket) this.socket = undefined;
    // Fechar ociosa (fim da vida, inatividade) nao e erro: a proxima mensagem reconecta.
    if (this.pendingId && !this.disposed) this.fail(this.pendingId, "connection_lost");
  }

  private fail(id: string, code: AgentChatClientFailure): void {
    if (this.pendingId === id) this.pendingId = undefined;
    if (!this.disposed) this.options.onEvent({ type: "error", id, code });
  }
}

async function requestTicket(userId: string): Promise<string> {
  const { ticket } = await authedFetch<AgentChatTicketDto>("/api/ai/chat/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return ticket;
}

function openBrowserSocket(url: string): ChatSocket {
  // Os handlers do `WebSocket` recebem `MessageEvent`/`CloseEvent`, que tem os
  // campos que `ChatSocket` le; o tipo so e mais estreito do que o necessario.
  return new WebSocket(url) as unknown as ChatSocket;
}

/** Mesma origem da pagina: o rewrite de `/api/*` do Next leva o upgrade ao Nest. */
function chatUrl(ticket: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ai/chat?ticket=${encodeURIComponent(ticket)}`;
}

function waitForReady(socket: ChatSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.onclose = null;
      socket.close(1000, "ready timeout");
      reject(new ConnectionFailedError("ready timeout"));
    }, timeoutMs);

    socket.onmessage = (event) => {
      try {
        if ((JSON.parse(String(event.data)) as AgentChatServerFrame).type !== "ready") return;
      } catch {
        return;
      }
      clearTimeout(timer);
      resolve();
    };
    socket.onclose = (event) => {
      clearTimeout(timer);
      reject(event.code === TICKET_REJECTED ? new TicketRejectedError() : new ConnectionFailedError(event.reason));
    };
    socket.onerror = () => {
      // O `close` vem logo depois e decide.
    };
  });
}
