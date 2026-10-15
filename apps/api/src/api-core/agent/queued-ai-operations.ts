import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { RunAgentRequest, RunAgentResponse } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import type { RunAgentUseCase } from "./run-agent.usecase";
import type { RunChatTurnRequest, RunChatTurnResponse, RunChatTurnUseCase } from "./run-chat-turn.usecase";
import type { CreateEventFromTranscriptUseCase } from "../events/create-event-from-transcript.usecase";
import type { GenerateMealNoteUseCase } from "../notes/generate-meal-note.usecase";

interface AgentJobPayload {
  mode: "chat" | "rest";
  input: RunChatTurnRequest;
  actor: AuthenticatedUser;
  clientMessageId?: string;
}

/** Transports submit work; only registered job handlers invoke the AI use cases. */
@Injectable()
export class QueuedAiOperations implements OnModuleInit {
  constructor(
    private readonly jobs: AiJobsService,
    private readonly agent: RunAgentUseCase,
    private readonly chat: RunChatTurnUseCase,
    private readonly transcript: CreateEventFromTranscriptUseCase,
    private readonly mealNote: GenerateMealNoteUseCase,
  ) {}

  onModuleInit(): void {
    this.jobs.register("agent-turn", async (raw, context) => {
      const payload = raw as AgentJobPayload;
      const options = {
        signal: context.signal,
        onProgress: (label: string) => { void context.progress(label).catch(() => {}); },
      };
      return payload.mode === "chat"
        ? this.chat.execute(payload.input, payload.actor, options)
        : this.agent.execute(payload.input, payload.actor, options);
    });
    this.jobs.register("transcript-event", async (raw) => {
      const payload = raw as { transcript: string; actor: AuthenticatedUser };
      return this.transcript.execute({ transcript: payload.transcript }, payload.actor);
    });
    this.jobs.register("meal-note", async (raw) => {
      return this.mealNote.execute(raw as Parameters<GenerateMealNoteUseCase["execute"]>[0]);
    }, {
      onFailure: async (raw) => this.mealNote.fail(raw as Parameters<GenerateMealNoteUseCase["fail"]>[0]),
    });
  }

  submitChat(input: RunChatTurnRequest, actor: AuthenticatedUser, clientMessageId: string) {
    return this.jobs.enqueue({
      kind: "agent-turn", userId: input.userId, actorId: actor.userId,
      dedupeKey: `chat:${actor.userId}:${clientMessageId}`,
      payload: { mode: "chat", input, actor, clientMessageId },
    });
  }

  async executeAgent(input: RunAgentRequest, actor: AuthenticatedUser): Promise<RunAgentResponse> {
    const jobId = await this.jobs.enqueue({
      kind: "agent-turn", userId: input.userId, actorId: actor.userId,
      payload: { mode: "rest", input, actor },
    });
    return await this.jobs.wait(jobId, input.userId) as RunAgentResponse;
  }

  submitTranscript(transcript: string, actor: AuthenticatedUser, requestId?: string) {
    return this.jobs.enqueue({
      kind: "transcript-event", userId: actor.userId, actorId: actor.userId,
      dedupeKey: requestId ? `voice:${requestId}` : undefined,
      payload: { transcript, actor, requestId },
    });
  }

  async executeTranscript(transcript: string, actor: AuthenticatedUser) {
    const jobId = await this.submitTranscript(transcript, actor);
    return await this.jobs.wait(jobId, actor.userId) as { eventId: string; kind: import("../../domain").EventKind };
  }

  /** A socket's abort signal represents explicit cancellation, never disconnect. */
  async execute(
    input: RunChatTurnRequest,
    actor: AuthenticatedUser,
    options: {
      requestId?: string;
      signal?: AbortSignal;
      observerSignal?: AbortSignal;
      onQueued?(jobId: string): void;
      onProgress?(label: string): void;
    } = {},
  ): Promise<RunChatTurnResponse> {
    const jobId = await this.submitChat(input, actor, options.requestId ?? crypto.randomUUID());
    options.onQueued?.(jobId);
    const cancel = () => { void this.jobs.cancel(jobId, input.userId).catch(() => {}); };
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    try {
      return await this.jobs.wait(
        jobId, input.userId,
        (value) => { if (typeof value === "string") options.onProgress?.(value); },
        options.observerSignal,
      ) as RunChatTurnResponse;
    } finally {
      options.signal?.removeEventListener("abort", cancel);
    }
  }
}
