import type { AuthenticatedUser } from "@/lib/auth/verify-firebase-token";
import type { EventCommandParsingGateway } from "../contracts/event-command-parsing.gateway";
import type { CreateEventInput } from "../dtos/create-event.input";
import { EVENT_TIME_ZONE } from "../services/event-creation-normalizer.service";
import { resolveEventSchedule } from "../services/event-schedule.service";
import type { EventType } from "../../domain/types/event-type";
import type { CreateEventUseCase } from "./create-event.usecase";

export const MAX_TRANSCRIPT_LENGTH = 1000;
export const EMPTY_TRANSCRIPT_ERROR = "Transcript is required";
export const LONG_TRANSCRIPT_ERROR = "Transcript is too long";

export class CreateEventFromTranscriptUseCase {
  constructor(
    private readonly parsingGateway: EventCommandParsingGateway,
    private readonly createEventUseCase: CreateEventUseCase,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(
    input: { transcript: string },
    actor: AuthenticatedUser,
  ): Promise<{ eventId: string; type: EventType }> {
    const transcript = input.transcript?.trim() ?? "";
    if (!transcript) throw new Error(EMPTY_TRANSCRIPT_ERROR);
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) throw new Error(LONG_TRANSCRIPT_ERROR);

    const parsed = await this.parsingGateway.parseCommand({ text: transcript });
    // A frase falada sempre vira a descricao, para o usuario saber o que foi entendido ao editar.
    const eventInput: CreateEventInput = { ...parsed.input, description: transcript };
    const schedule = resolveEventSchedule(parsed.schedule, this.clock(), EVENT_TIME_ZONE);
    const { eventId } = await this.createEventUseCase.execute(eventInput, actor, schedule);

    return { eventId, type: parsed.input.type };
  }
}
