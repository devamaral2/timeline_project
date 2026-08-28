import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { FoodParsingGateway } from "../gateways/food-parsing.gateway";
import type { DomainEvent, EventRepository } from "@repo/entities/ports";
import type { TagRepository } from "@repo/entities/ports";
import type { CreateEventInput } from "@repo/entities/contracts";
import {
  normalizeCreateEventInput,
  type NormalizedCreateEvent,
} from "../services/event-creation-normalizer.service";
import type { ResolvedEventSchedule } from "../services/event-schedule.service";
import { FoodTotalsService } from "../services/food-totals.service";
import { FoodEvent } from "@repo/entities";
import { RoutineEvent } from "@repo/entities";
import { SleepEvent } from "@repo/entities";
import { TrainingEvent } from "@repo/entities";

export class CreateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly tagRepository: TagRepository,
    private readonly foodParsingGateway: FoodParsingGateway,
    private readonly foodTotalsService: FoodTotalsService = new FoodTotalsService(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(
    input: CreateEventInput,
    actor: AuthenticatedUser,
    schedule?: ResolvedEventSchedule,
  ): Promise<{ eventId: string }> {
    const now = this.clock();
    const normalized = normalizeCreateEventInput(input, now, schedule);
    const event =
      normalized.type === "food"
        ? await createFoodEventFromNormalizedInput(
            normalized,
            actor.userId,
            this.foodParsingGateway,
            this.foodTotalsService,
          )
        : buildDomainEvent(normalized, actor.userId);
    await this.tagRepository.upsertMany(event.tags, actor.userId);
    // O evento anterior termina quando este comeca -- que nem sempre e "agora", desde que o
    // agente de voz pode registrar algo que comecou no passado.
    await this.eventRepository.saveClosingLatestOpen(event, event.startedAt);
    return { eventId: event.id };
  }
}

export function buildDomainEvent(
  input: Exclude<NormalizedCreateEvent, { type: "food" }>,
  userId: string,
): DomainEvent {
  switch (input.type) {
    case "routine":
      return RoutineEvent.create({
        userId,
        name: input.name,
        description: input.description,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        tags: input.tags,
        missed: input.missed,
        priority: input.priority,
        interruptions: input.interruptions,
        data: input.data,
      });
    case "training":
      return TrainingEvent.create({
        userId,
        name: input.name,
        description: input.description,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        tags: input.tags,
        missed: input.missed,
        priority: input.priority,
        interruptions: input.interruptions,
        data: input.data,
      });
    case "sleep":
      return SleepEvent.create({
        userId,
        name: input.name,
        description: input.description,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        tags: input.tags,
        missed: input.missed,
        priority: input.priority,
        interruptions: input.interruptions,
        data: input.data,
      });
  }
}

async function createFoodEventFromNormalizedInput(
  input: Extract<NormalizedCreateEvent, { type: "food" }>,
  userId: string,
  foodParsingGateway: FoodParsingGateway,
  foodTotalsService: FoodTotalsService,
): Promise<FoodEvent> {
  const parsedMeal = await foodParsingGateway.parseMeal({ text: input.inputText });
  return FoodEvent.create({
    ...input,
    userId,
    data: {
      inputText: input.inputText,
      items: parsedMeal.items,
      totals: foodTotalsService.calculate(parsedMeal.items),
      modelProvider: parsedMeal.modelProvider,
      modelName: parsedMeal.modelName,
      parsedAt: input.startedAt,
    },
  });
}
