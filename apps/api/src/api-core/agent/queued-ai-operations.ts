import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import type { CreateEventFromTranscriptUseCase } from "../events/create-event-from-transcript.usecase";
import type { GenerateMealNoteUseCase } from "../notes/generate-meal-note.usecase";
import { HermesRequestError, hermesSessionId, type HermesChat } from "../../infrastructure/hermes/hermes.client";

const HERMES_PROGRESS_INTERVAL_MS = 400;

interface HermesJobPayload {
  mode: "hermes";
  input: { userId: string; text: string; conversationId?: string };
  actor: AuthenticatedUser;
  clientMessageId: string;
}

/** Transports submit work; only registered job handlers invoke the AI use cases. */
@Injectable()
export class QueuedAiOperations implements OnModuleInit {
  constructor(
    private readonly jobs: AiJobsService,
    private readonly transcript: CreateEventFromTranscriptUseCase,
    private readonly mealNote: GenerateMealNoteUseCase,
    /** Ausente quando o servidor nao configura o Hermes: o job falha sem tentar de novo. */
    private readonly hermes?: HermesChat,
  ) {}

  onModuleInit(): void {
    this.jobs.register("transcript-event", async (raw) => {
      const payload = raw as { transcript: string; actor: AuthenticatedUser };
      return this.transcript.execute({ transcript: payload.transcript }, payload.actor);
    });
    this.jobs.register("hermes-turn", async (raw, context) => {
      const { input } = raw as HermesJobPayload;
      if (!this.hermes) throw new HermesRequestError("Hermes is not configured");
      // Cada passo e uma escrita no banco: so uma por intervalo; o resultado final traz a lista completa.
      let lastWrite = 0;
      let writes: Promise<unknown> = Promise.resolve();
      const reply = await this.hermes.chat({
        text: input.text,
        sessionId: hermesSessionId(input.userId, input.conversationId),
        signal: context.signal,
        onSteps: (steps) => {
          const now = Date.now();
          if (now - lastWrite < HERMES_PROGRESS_INTERVAL_MS) return;
          lastWrite = now;
          writes = writes.then(() => context.progress({ steps })).catch(() => {});
        },
      });
      await writes;
      return reply;
    });
    this.jobs.register("meal-note", async (raw) => {
      return this.mealNote.execute(raw as Parameters<GenerateMealNoteUseCase["execute"]>[0]);
    }, {
      onFailure: async (raw) => this.mealNote.fail(raw as Parameters<GenerateMealNoteUseCase["fail"]>[0]),
    });
  }

  /** Uma mensagem para o Hermes (ADR 004); o job devolve `{ text }` e o cliente acompanha por `GET /api/ai/jobs/:id`. */
  submitHermes(input: HermesJobPayload["input"], actor: AuthenticatedUser, clientMessageId: string) {
    return this.jobs.enqueue({
      kind: "hermes-turn", userId: input.userId, actorId: actor.userId,
      dedupeKey: `hermes:${actor.userId}:${clientMessageId}`,
      payload: { mode: "hermes", input, actor, clientMessageId } satisfies HermesJobPayload,
    });
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
}
