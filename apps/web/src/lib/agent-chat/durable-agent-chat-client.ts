import { ApiError } from "@/lib/api/authed-fetch";
import type { AgentChatMessageFrame } from "@/lib/api/contracts";
import { aiJobs, isJobPending, type AiJobDto, type SubmitAiJobRequest } from "@/lib/ai-jobs/ai-jobs";
import type { AgentChatClientOptions } from "./agent-chat-client";

interface Options extends AgentChatClientOptions {
  onRecover(job: AiJobDto): boolean;
  api?: Pick<typeof aiJobs, "list" | "submit" | "get" | "cancel">;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
  pollMs?: number;
}

/**
 * A transport failure is not an agent failure. Before acceptance, retain the
 * exact submission (including its id); after acceptance, only query that job.
 * The small outbox also covers a reload during an ambiguous POST response.
 */
export class DurableAgentChatClient {
  private disposed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private job?: AiJobDto;
  private request?: SubmitAiJobRequest;
  private cancelling = false;
  private inFlight = false;
  private readonly api;
  private readonly storage;
  private readonly key: string;

  constructor(private readonly options: Options) {
    this.api = options.api ?? aiJobs;
    this.storage = options.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    this.key = `ai-chat-outbox:${options.userId}`;
    void this.recover();
  }

  async send(message: Omit<AgentChatMessageFrame, "type">): Promise<void> {
    this.request = {
      userId: this.options.userId,
      text: message.text,
      clientMessageId: message.id,
      context: message.context,
      conversationId: message.conversationId,
    };
    this.job = undefined;
    this.cancelling = false;
    this.save(this.request);
    await this.step();
  }

  cancel(): void {
    this.cancelling = true;
    if (this.job && !this.inFlight) {
      clearTimeout(this.timer);
      void this.step();
    }
  }

  close(): void {
    this.disposed = true;
    clearTimeout(this.timer);
  }

  private save(request?: SubmitAiJobRequest): void {
    try {
      if (request) this.storage?.setItem(`${this.key}:${request.clientMessageId}`, JSON.stringify(request));
      else if (this.request) this.storage?.removeItem(`${this.key}:${this.request.clientMessageId}`);
    } catch {
      // Storage may be unavailable; accepted work is still recoverable by list.
    }
  }

  private async recover(): Promise<void> {
    let outbox: SubmitAiJobRequest | undefined;
    try {
      // Migrate the original single-slot outbox without dropping an ambiguous POST.
      const raw = this.storage?.getItem(this.key);
      if (raw) {
        outbox = JSON.parse(raw);
        if (outbox) this.save(outbox);
        this.storage?.removeItem(this.key);
      }
      for (let index = 0; !outbox && index < (this.storage?.length ?? 0); index++) {
        const key = this.storage?.key(index);
        if (key?.startsWith(`${this.key}:`)) {
          const value = this.storage?.getItem(key);
          if (value) outbox = JSON.parse(value);
        }
      }
    } catch { /* An unusable outbox must not prevent server-side recovery. */ }
    try {
      const jobs = (await this.api.list()).filter((job) => job.kind === "agent-turn")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (this.disposed || this.request) return;
      const job = outbox
        ? jobs.find((item) => item.request?.clientMessageId === outbox?.clientMessageId)
        : jobs.find(isJobPending);
      if (job && this.options.onRecover(job)) {
        this.job = job;
        this.request = outbox ?? {
          userId: this.options.userId,
          text: job.request?.text ?? "",
          clientMessageId: job.request?.clientMessageId ?? job.id,
          conversationId: job.request?.conversationId,
        };
        this.save(this.request);
        if (this.deliver(job)) this.schedule();
        return;
      }
    } catch {
      // Reopening while offline must recover once connectivity returns, even
      // when the browser has already cleared the accepted submission outbox.
      if (!outbox && !this.disposed && !this.request) {
        this.timer = setTimeout(() => void this.recover(), this.options.pollMs ?? 1500);
      }
    }
    if (outbox && !this.disposed && !this.request) {
      const provisional: AiJobDto = {
        id: outbox.clientMessageId, kind: "agent-turn", status: "queued",
        userId: outbox.userId, createdAt: "", updatedAt: "", request: outbox,
      };
      if (this.options.onRecover(provisional)) {
        this.request = outbox;
        await this.step();
      }
    }
  }

  private schedule(): void {
    if (!this.disposed) this.timer = setTimeout(() => void this.step(), this.options.pollMs ?? 1500);
  }

  private async step(): Promise<void> {
    if (this.disposed || !this.request || this.inFlight) return;
    this.inFlight = true;
    try {
      this.job = this.job
        ? await (this.cancelling ? this.api.cancel(this.job.id) : this.api.get(this.job.id))
        : await this.api.submit(this.request);
      // Acceptance is not observation: retain the receipt until terminal delivery.
      this.save(this.request);
      if (this.disposed) return;
      if (this.deliver(this.job)) this.schedule();
    } catch (error) {
      if (this.disposed) return;
      // Only a definitive rejected submission is safe to present as failed.
      if (!this.job && error instanceof ApiError && [400, 403, 404, 422].includes(error.status)) {
        this.save();
        this.options.onEvent({ type: "error", id: this.request.clientMessageId, code: "invalid_input" });
        this.request = undefined;
        return;
      }
      this.options.onEvent({
        type: "status", id: this.request.clientMessageId,
        label: error instanceof ApiError && error.status === 401
          ? "Entre novamente para acompanhar o pedido."
          : "Reconectando — seu pedido continua salvo.",
      });
      this.schedule();
    } finally {
      this.inFlight = false;
    }
  }

  private deliver(job: AiJobDto): boolean {
    const id = this.request?.clientMessageId ?? job.request?.clientMessageId ?? job.id;
    if (isJobPending(job)) {
      this.options.onEvent({ type: "status", id, label: job.progress ?? (job.status === "queued" ? "Na fila" : "Preparando resposta") });
      return true;
    }
    if (job.status === "succeeded" && job.result && "agentResponse" in job.result
      && job.result.conversationId && job.result.assistantSeq !== undefined) {
      this.options.onEvent({ type: "reply", id, ...job.result,
        conversationId: job.result.conversationId, assistantSeq: job.result.assistantSeq });
    } else {
      this.options.onEvent({ type: "error", id, code: job.status === "cancelled" ? "cancelled" : job.errorCode ?? "internal" });
    }
    this.save();
    this.request = undefined;
    return false;
  }
}
