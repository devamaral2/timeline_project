import type { LoggerService } from "@nestjs/common";
import type { AgentChatMessageFrame, AgentChatServerFrame } from "@repo/contracts";
import type { AgentChatGrant } from "../../../domain/ports";
import { toChatEntityRefs } from "../../../api-core/agent/services/agent-chat-history";
import type { QueuedAiOperations } from "../../../api-core/agent/queued-ai-operations";
import {
  CHAT_CLOSE,
  CHAT_CONNECTION_LIFETIME_MS,
  CHAT_IDLE_TIMEOUT_MS,
  chatErrorCodeOf,
  parseClientFrame,
} from "./chat-protocol";

/** O socket, visto pela conversa: mandar um frame e fechar. */
export interface AgentChatTransport {
  send(frame: AgentChatServerFrame): void;
  close(code: number, reason: string): void;
}

export interface AgentChatClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: AgentChatClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    handle.unref();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * Uma conversa num socket ja autenticado. Nao conhece rede: quem liga isto ao
 * `ws` e o `AgentChatServer`.
 *
 * Uma resposta por vez. A resposta so e enviada depois do commit — o que vai
 * antes sao so os rotulos de progresso. Fechar a conexao apenas desliga o
 * observador: o job continua. Cancelar explicitamente pede cancelamento do job.
 */
export class AgentChatConnection {
  private running?: { id: string; controller: AbortController; observer: AbortController };
  private closed = false;
  private lifetimeOver = false;
  private idleTimer?: unknown;
  private lifetimeTimer?: unknown;

  constructor(
    private readonly transport: AgentChatTransport,
    private readonly grant: AgentChatGrant,
    private readonly runChatTurn: Pick<QueuedAiOperations, "execute">,
    private readonly logger: Pick<LoggerService, "error">,
    private readonly clock: AgentChatClock = systemClock,
    private readonly limits = { lifetimeMs: CHAT_CONNECTION_LIFETIME_MS, idleMs: CHAT_IDLE_TIMEOUT_MS },
  ) {}

  start(): void {
    const expiresAt = new Date(this.clock.now() + this.limits.lifetimeMs).toISOString();
    this.lifetimeTimer = this.clock.setTimeout(() => this.endLifetime(), this.limits.lifetimeMs);
    this.armIdle();
    this.transport.send({ type: "ready", userId: this.grant.targetUserId, expiresAt });
  }

  /** Resolve quando o que o frame disparou terminou — a resposta inteira, no caso de uma mensagem. */
  async handleMessage(raw: string): Promise<void> {
    if (this.closed) return;
    const parsed = parseClientFrame(raw);
    if (!parsed.ok) {
      this.transport.send({ type: "error", id: parsed.id, code: "invalid_frame" });
      return;
    }

    const { frame } = parsed;
    if (frame.type === "cancel") {
      if (this.running?.id === frame.id) this.running.controller.abort();
      return;
    }
    if (this.running) {
      this.transport.send({ type: "error", id: frame.id, code: "busy" });
      return;
    }
    await this.answer(frame);
  }

  /** O socket fechou: desliga o observador, nao cancela o trabalho aceito. */
  handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.running?.observer.abort();
    this.clock.clearTimeout(this.idleTimer);
    this.clock.clearTimeout(this.lifetimeTimer);
  }

  private async answer(frame: AgentChatMessageFrame): Promise<void> {
    const controller = new AbortController();
    const observer = new AbortController();
    this.running = { id: frame.id, controller, observer };
    this.clock.clearTimeout(this.idleTimer);

    try {
      const { conversationId, assistantSeq, ...response } = await this.runChatTurn.execute(
        {
          userId: this.grant.targetUserId,
          text: frame.text,
          context: frame.context,
          conversationId: frame.conversationId,
        },
        this.grant.actor,
        {
          requestId: frame.id,
          signal: controller.signal,
          observerSignal: observer.signal,
          onQueued: (jobId) => {
            if (!this.closed) this.transport.send({ type: "queued", id: frame.id, jobId });
          },
          onProgress: (label) => {
            if (!this.closed) this.transport.send({ type: "status", id: frame.id, label });
          },
        },
      );
      if (!this.closed) {
        this.transport.send({
          type: "reply",
          id: frame.id,
          conversationId,
          assistantSeq,
          entities: toChatEntityRefs(response),
          ...response,
        });
      }
    } catch (error) {
      const code = chatErrorCodeOf(error);
      if (code === "internal") {
        this.logger.error("agent chat run failed", error instanceof Error ? error.stack : String(error));
      }
      if (!this.closed) this.transport.send({ type: "error", id: frame.id, code });
    } finally {
      this.running = undefined;
    }

    if (this.closed) return;
    if (this.lifetimeOver) {
      this.transport.close(CHAT_CLOSE.reauthenticate, "reauthenticate");
      return;
    }
    this.armIdle();
  }

  private endLifetime(): void {
    this.lifetimeOver = true;
    // Uma resposta em andamento termina antes: quem fecha e o fim dela.
    if (!this.running) this.transport.close(CHAT_CLOSE.reauthenticate, "reauthenticate");
  }

  private armIdle(): void {
    this.clock.clearTimeout(this.idleTimer);
    this.idleTimer = this.clock.setTimeout(() => {
      if (!this.running) this.transport.close(CHAT_CLOSE.idle, "idle");
    }, this.limits.idleMs);
  }
}
