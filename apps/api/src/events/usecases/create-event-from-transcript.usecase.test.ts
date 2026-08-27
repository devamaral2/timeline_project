import { expect, test } from "vitest";
import {
  CreateEventFromTranscriptUseCase,
  EMPTY_TRANSCRIPT_ERROR,
  LONG_TRANSCRIPT_ERROR,
} from "./create-event-from-transcript.usecase";
import { CreateEventUseCase } from "./create-event.usecase";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { InMemoryTagRepository } from "../testing/in-memory-tag.repository";
import { StubEventCommandParsingGateway } from "../testing/stub-event-command-parsing.gateway";
import { StubFoodParsingGateway } from "../testing/stub-food-parsing.gateway";
import type { CreateEventInput } from "@repo/entities/contracts";
import type { ParsedEventSchedule } from "../services/event-schedule.service";
import { FoodEvent } from "@repo/entities";
import { RoutineEvent } from "@repo/entities";
import { SleepEvent } from "@repo/entities";

const actor = { userId: "user-1" };
const aRoutine: CreateEventInput = { type: "routine", name: "Rotina", tags: [] };
// 23:00 do dia 23/08 no horario de Sao Paulo (UTC-3).
const lateNight = new Date("2026-08-24T02:00:00.000Z");

interface UseCaseOptions {
  input?: CreateEventInput;
  schedule?: ParsedEventSchedule;
  foodGateway?: StubFoodParsingGateway;
  now?: Date;
}

function makeUseCase({
  input = aRoutine,
  schedule = {},
  foodGateway = new StubFoodParsingGateway(),
  now = lateNight,
}: UseCaseOptions = {}): {
  useCase: CreateEventFromTranscriptUseCase;
  eventRepository: InMemoryEventRepository;
  parsingGateway: StubEventCommandParsingGateway;
} {
  const eventRepository = new InMemoryEventRepository();
  const parsingGateway = new StubEventCommandParsingGateway({
    input,
    schedule,
    modelProvider: "stub",
    modelName: "stub-model",
  });
  const useCase = new CreateEventFromTranscriptUseCase(
    parsingGateway,
    new CreateEventUseCase(eventRepository, new InMemoryTagRepository(), foodGateway),
    () => now,
  );
  return { useCase, eventRepository, parsingGateway };
}

test("keeps the spoken phrase as the event description", async () => {
  const { useCase, eventRepository } = makeUseCase({
    input: { type: "routine", name: "Estudar ingles", tags: [] },
  });

  const result = await useCase.execute({ transcript: "  comecei a estudar ingles  " }, actor);
  const persistedEvent = await eventRepository.findById(result.eventId);

  expect(result.type).toBe("routine");
  expect(persistedEvent).toBeInstanceOf(RoutineEvent);
  expect(persistedEvent?.name).toBe("Estudar ingles");
  expect(persistedEvent?.description).toBe("comecei a estudar ingles");
});

test("sends the trimmed transcript to the parsing agent", async () => {
  const { useCase, parsingGateway } = makeUseCase();

  await useCase.execute({ transcript: "  fui na padaria  " }, actor);

  expect(parsingGateway.calls).toEqual([{ text: "fui na padaria" }]);
});

test("leaves the event open when the phrase carried no window", async () => {
  const { useCase, eventRepository } = makeUseCase();

  const result = await useCase.execute({ transcript: "comecei a trabalhar" }, actor);
  const persistedEvent = await eventRepository.findById(result.eventId);

  expect(persistedEvent?.startedAt).toEqual(lateNight);
  expect(persistedEvent?.finishedAt).toBeUndefined();
});

test("closes a sleep event spoken with a duration, crossing into the next day", async () => {
  const { useCase, eventRepository } = makeUseCase({
    input: { type: "sleep", data: { trackedSleepTime: 6 }, tags: [] },
    schedule: { durationMinutes: 360 },
  });

  const result = await useCase.execute(
    { transcript: "vou dormir agora e volto em seis horas" },
    actor,
  );
  const persistedEvent = await eventRepository.findById(result.eventId);

  expect(persistedEvent).toBeInstanceOf(SleepEvent);
  expect(persistedEvent?.startedAt.toISOString()).toBe("2026-08-24T02:00:00.000Z");
  expect(persistedEvent?.finishedAt?.toISOString()).toBe("2026-08-24T08:00:00.000Z");
  expect(persistedEvent?.getDurationMinutes()).toBe(360);
});

test("closes a sleep event at the spoken clock time of the next morning", async () => {
  const { useCase, eventRepository } = makeUseCase({
    input: { type: "sleep", tags: [] },
    schedule: { endTimeOfDay: "06:00" },
  });

  const result = await useCase.execute(
    { transcript: "vou dormir agora, acordo as seis da manha" },
    actor,
  );
  const persistedEvent = await eventRepository.findById(result.eventId);

  // 06:00 do dia 24/08 no horario local: o dia seguinte a fala.
  expect(persistedEvent?.finishedAt?.toISOString()).toBe("2026-08-24T09:00:00.000Z");
});

test("starts the event in the past when the phrase says so", async () => {
  const { useCase, eventRepository } = makeUseCase({ schedule: { startOffsetMinutes: -20 } });

  const result = await useCase.execute({ transcript: "acordei faz vinte minutos" }, actor);
  const persistedEvent = await eventRepository.findById(result.eventId);

  expect(persistedEvent?.startedAt.toISOString()).toBe("2026-08-24T01:40:00.000Z");
});

test("closes the previous open event when the new one started, not when the agent answered", async () => {
  const { useCase, eventRepository } = makeUseCase({ schedule: { startOffsetMinutes: -20 } });
  await eventRepository.save(
    RoutineEvent.create({
      userId: actor.userId,
      name: "Trabalhar",
      description: "",
      startedAt: new Date("2026-08-24T00:00:00.000Z"),
      tags: [],
      interruptions: [],
      data: {},
    }),
  );

  await useCase.execute({ transcript: "acordei faz vinte minutos" }, actor);
  const previousEvent = (await eventRepository.listTimeline({ userId: actor.userId })).find(
    (event) => event.name === "Trabalhar",
  );

  expect(previousEvent?.finishedAt?.toISOString()).toBe("2026-08-24T01:40:00.000Z");
});

test("names a food event after the hour it was eaten, not the hour it was dictated", async () => {
  const foodGateway = new StubFoodParsingGateway();
  const { useCase, eventRepository } = makeUseCase({
    input: { type: "food", inputText: "arroz e feijao", tags: [] },
    // Falado as 23:00, mas o almoco foi as 12:00 do mesmo dia.
    schedule: { startTimeOfDay: "12:00" },
    foodGateway,
  });

  const result = await useCase.execute({ transcript: "almocei arroz e feijao" }, actor);
  const persistedEvent = await eventRepository.findById(result.eventId);

  expect(persistedEvent?.name).toBe("Almoço");
  expect(persistedEvent?.startedAt.toISOString()).toBe("2026-08-23T15:00:00.000Z");
});

test("routes a food command through the food parsing gateway", async () => {
  const foodGateway = new StubFoodParsingGateway({
    items: [
      {
        food: "Banana prata",
        portion: "1 unidade",
        approximateWeightGrams: 100,
        caloriesKcal: 89,
        macronutrients: {
          carbohydratesGrams: 22.8,
          proteinsGrams: 1.1,
          totalFatGrams: 0.3,
          fiberGrams: 2.6,
        },
        mainMicronutrients: {},
        otherData: {},
      },
    ],
    modelProvider: "stub",
    modelName: "stub-model",
  });
  const { useCase, eventRepository } = makeUseCase({
    input: { type: "food", inputText: "uma banana", tags: [] },
    foodGateway,
  });

  const result = await useCase.execute({ transcript: "comi uma banana" }, actor);
  const persistedEvent = await eventRepository.findById(result.eventId);

  expect(result.type).toBe("food");
  expect(persistedEvent).toBeInstanceOf(FoodEvent);
  expect((persistedEvent as FoodEvent).data.totals.totalCaloriesKcal).toBe(89);
  expect((persistedEvent as FoodEvent).data.inputText).toBe("uma banana");
});

test("never persists tags invented by the agent flow", async () => {
  const { useCase, eventRepository } = makeUseCase();

  const result = await useCase.execute({ transcript: "fui na padaria" }, actor);
  const persistedEvent = await eventRepository.findById(result.eventId);

  expect(persistedEvent?.tags).toEqual([]);
});

test("rejects an empty transcript before calling the agent", async () => {
  const { useCase, parsingGateway } = makeUseCase();

  await expect(useCase.execute({ transcript: "   " }, actor)).rejects.toThrow(
    EMPTY_TRANSCRIPT_ERROR,
  );
  expect(parsingGateway.calls).toEqual([]);
});

test("rejects a transcript longer than the cost guard", async () => {
  const { useCase } = makeUseCase();

  await expect(useCase.execute({ transcript: "a".repeat(1001) }, actor)).rejects.toThrow(
    LONG_TRANSCRIPT_ERROR,
  );
});
