import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  Logger,
  type BeforeApplicationShutdown,
  type LoggerService,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import type { AgentChatGrant, AgentChatTicketStore } from "@repo/entities/ports";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { hashAgentChatTicket } from "../usecases/issue-agent-chat-ticket.usecase";
import type { RunChatTurnUseCase } from "../usecases/run-chat-turn.usecase";
import { AgentChatConnection, type AgentChatTransport } from "./agent-chat-connection";
import {
  AGENT_CHAT_PATH,
  CHAT_CLOSE,
  CHAT_HEARTBEAT_MS,
  CHAT_MAX_PAYLOAD_BYTES,
  CHAT_TICKET_FORMAT,
} from "./chat-protocol";

interface SocketState {
  alive: boolean;
  connection?: AgentChatConnection;
}

/**
 * O WebSocket do chat, pendurado no mesmo servidor HTTP do Nest em
 * `/api/ai/chat`. No web o upgrade chega pelo rewrite de `/api/*` do Next; no
 * mobile, direto.
 *
 * Quem autentica e o ticket de `?ticket=`, emitido por
 * `POST /api/ai/chat/tickets` (que passa pelo `AuthServiceGuard`) e consumido
 * aqui uma unica vez. O socket e aceito antes da conferencia de proposito:
 * recusar o upgrade com 401 chegaria ao navegador como um 1006 mudo, e o
 * 4401 diz ao cliente que o problema e o ticket.
 */
export class AgentChatServer implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly sockets = new Map<WebSocket, SocketState>();
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: CHAT_MAX_PAYLOAD_BYTES });
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly httpServer: () => Server,
    private readonly tickets: AgentChatTicketStore,
    private readonly runChatTurn: Pick<RunChatTurnUseCase, "execute">,
    private readonly logger: Pick<LoggerService, "error" | "warn"> = new Logger(AgentChatServer.name),
  ) {}

  onApplicationBootstrap(): void {
    this.httpServer().on("upgrade", this.onUpgrade);
    this.heartbeat = setInterval(() => this.ping(), CHAT_HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  beforeApplicationShutdown(): void {
    clearInterval(this.heartbeat);
    this.httpServer().off("upgrade", this.onUpgrade);
    for (const [socket, state] of this.sockets) {
      state.connection?.handleClose();
      socket.close(CHAT_CLOSE.goingAway, "server shutting down");
    }
    this.wss.close();
  }

  private readonly onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url ?? "/", "http://localhost");
    // Nenhuma outra parte da API aceita upgrade: sem isto o socket ficaria
    // pendurado ate o timeout.
    if (url.pathname !== AGENT_CHAT_PATH) {
      socket.destroy();
      return;
    }
    const ticket = url.searchParams.get("ticket");
    this.wss.handleUpgrade(request, socket, head, (ws) => void this.accept(ws, ticket));
  };

  private async accept(ws: WebSocket, ticket: string | null): Promise<void> {
    const state: SocketState = { alive: true };
    this.sockets.set(ws, state);
    ws.on("pong", () => {
      state.alive = true;
    });
    ws.on("error", (error) => this.logger.warn(`agent chat socket error: ${error.message}`));
    ws.on("close", () => {
      this.sockets.delete(ws);
      state.connection?.handleClose();
    });
    // O cliente espera o `ready`; um frame antes disso nao tem conversa para ir.
    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (!state.connection || isBinary) {
        send(ws, { type: "error", code: "invalid_frame" });
        return;
      }
      void state.connection.handleMessage(rawText(data));
    });

    let grant: AgentChatGrant | null;
    try {
      grant = ticket && CHAT_TICKET_FORMAT.test(ticket) ? await this.tickets.consume(hashAgentChatTicket(ticket)) : null;
    } catch (error) {
      this.logger.error(`agent chat ticket lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      ws.close(CHAT_CLOSE.internalError, "unavailable");
      return;
    }

    if (ws.readyState !== WebSocket.OPEN) return;
    if (!grant) {
      ws.close(CHAT_CLOSE.unauthorized, "unauthorized");
      return;
    }

    state.connection = new AgentChatConnection(transportOf(ws), grant, this.runChatTurn, this.logger);
    state.connection.start();
  }

  private ping(): void {
    for (const [socket, state] of this.sockets) {
      if (!state.alive) {
        socket.terminate();
        continue;
      }
      state.alive = false;
      socket.ping();
    }
  }
}

function transportOf(ws: WebSocket): AgentChatTransport {
  return {
    send: (frame) => send(ws, frame),
    close: (code, reason) => {
      if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
    },
  };
}

function send(ws: WebSocket, frame: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
}

function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data as ArrayBuffer).toString("utf8");
}
