import type { AuthenticatedUser } from "@/lib/auth/verify-firebase-token";
import type { FoodParsingGateway } from "../contracts/food-parsing.gateway";
import type { DomainEvent, EventRepository } from "../contracts/event-repository";
import type { TagRepository } from "../contracts/tag-repository";
import type { CreateEventInput } from "../dtos/create-event.input";
import {
  normalizeCreateEventInput,
  type NormalizedCreateEvent,
} from "../services/event-creation-normalizer.service";
import { FoodTotalsService } from "../services/food-totals.service";
import { FoodEvent } from "../../domain/entities/food-event.entity";
import { RoutineEvent } from "../../domain/entities/routine-event.entity";
import { SleepEvent } from "../../domain/entities/sleep-event.entity";
import { TrainingEvent } from "../../domain/entities/training-event.entity";

export class CreateEventUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly tagRepository: TagRepository,
    private readonly foodParsingGateway: FoodParsingGateway,
    private readonly foodTotalsService: FoodTotalsService = new FoodTotalsService(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: CreateEventInput, actor: AuthenticatedUser): Promise<{ eventId: string }> {
    const now = this.clock();
    const normalized = normalizeCreateEventInput(input, now);
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
    await this.eventRepository.saveClosingLatestOpen(event, now);
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
