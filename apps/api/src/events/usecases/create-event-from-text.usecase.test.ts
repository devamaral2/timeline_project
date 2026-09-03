import { expect, test } from "vitest";
import { EventAgentUndecidedError, InvalidInputError } from "../errors/event-agent.errors";
import { CreateEventFromTextUseCase } from "./create-event-from-text.usecase";
import { CreateEventUseCase } from "./create-event.usecase";
import { InMemoryEventDatabase } from "../testing/in-memory-event-database";
import { InMemoryEventRepository } from "../testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../testing/in-memory-workout.catalog";
import { ScriptedEventAgentGateway } from "../testing/scripted-event-agent.gateway";
import { StubMealParsingGateway } from "../testing/stub-meal-parsing.gateway";
import type { ScriptedAgentCall } from "../testing/scripted-event-agent.gateway";

const actor = { userId: "firebase-user-1" };

function buildUseCase(rounds: ScriptedAgentCall[][], mealParsing?: StubMealParsingGateway) {
  const database = new InMemoryEventDatabase();
  const eventRepository = new InMemoryEventRepository(database);
  const agentGateway = new ScriptedEventAgentGateway(rounds);
  const useCase = new CreateEventFromTextUseCase(
    agentGateway,
    new CreateEventUseCase(
      eventRepository,
      mealParsing ?? new StubMealParsingGateway(),
      new InMemoryWorkoutCatalog(),
    ),
  );

  return { useCase, eventRepository, agentGateway };
}

test("creates a training event from the skill the agent chose", async () => {
  const { useCase, eventRepository } = buildUseCase([
    [
      {
        name: "create_training_event",
        args: {
          workouts: [{ type: "running", distance: 5, duration: 90, pace: 18, calories: 300 }],
          tags: ["Corrida"],
        },
      },
    ],
  ]);

  const result = await useCase.execute(
    { text: "Corri 5 km, por uma hora e meia e queimei 300 calorias" },
    actor,
  );

  expect(result.eventIds).toHaveLength(1);
  expect(result.skillsUsed).toEqual(["create_training_event"]);
  expect(result.modelName).toBe("scripted-model");

  const savedEvent = await eventRepository.findById(result.eventIds[0]);
  expect(savedEvent?.name).toBe("Treino");
  expect(savedEvent?.items[0].data).toMatchObject({
    caloriesBurned: 300,
    workouts: [{ workoutCode: "running", distance: 5, duration: 90, pace: 18, calories: 300 }],
  });
  expect(savedEvent?.tags).toEqual(["corrida"]);
});

test("passes the skills and a system prompt naming each one to the agent", async () => {
  const { useCase, agentGateway } = buildUseCase([
    [{ name: "create_routine_event", args: { name: "Estudar" } }],
  ]);

  await useCase.execute({ text: "estudei" }, actor);

  const runInput = agentGateway.lastRunInput;
  expect(runInput?.text).toBe("estudei");
  expect(runInput?.skills.map((skill) => skill.name)).toEqual([
    "create_training_event",
    "create_meal_event",
    "create_sleep_event",
    "create_routine_event",
  ]);
  for (const skill of runInput?.skills ?? []) {
    expect(runInput?.systemPrompt).toContain(skill.name);
  }
});

test("returns invalid arguments to the agent so it can correct itself", async () => {
  const { useCase, eventRepository, agentGateway } = buildUseCase([
    // 1ª rodada: duration negativo, reprovado pelo schema da skill
    [
      {
        name: "create_training_event",
        args: { workouts: [{ type: "running", distance: 5, duration: -1, pace: 18, calories: 300 }] },
      },
    ],
    // 2ª rodada: o modelo corrige
    [
      {
        name: "create_training_event",
        args: { workouts: [{ type: "running", distance: 5, duration: 90, pace: 18, calories: 300 }] },
      },
    ],
  ]);

  const result = await useCase.execute({ text: "Corri 5 km" }, actor);

  expect(agentGateway.results[0]).toMatchObject({ ok: false });
  expect(agentGateway.results[1]).toMatchObject({ ok: true });
  expect(result.eventIds).toHaveLength(1);
  expect(await eventRepository.findById(result.eventIds[0])).not.toBeNull();
});

test("reports an unknown skill back to the agent instead of throwing", async () => {
  const { useCase, agentGateway } = buildUseCase([
    [{ name: "create_meditation_event", args: {} }],
  ]);

  await expect(useCase.execute({ text: "meditei" }, actor)).rejects.toThrow(
    EventAgentUndecidedError,
  );
  expect(agentGateway.results[0]).toEqual({
    ok: false,
    error: "Skill desconhecida: create_meditation_event",
  });
});

test("fails with 'undecided' when the agent calls no skill at all", async () => {
  const { useCase, eventRepository } = buildUseCase([]);

  await expect(useCase.execute({ text: "asdfghjkl" }, actor)).rejects.toThrow(
    EventAgentUndecidedError,
  );
  await expect(eventRepository.findLatestOpenByUserId(actor.userId)).resolves.toBeNull();
});

test("rejects blank text before reaching the agent", async () => {
  const { useCase, agentGateway } = buildUseCase([]);

  await expect(useCase.execute({ text: "   " }, actor)).rejects.toThrow(InvalidInputError);
  expect(agentGateway.lastRunInput).toBeUndefined();
});

test("creates one event per skill call when the text describes two activities", async () => {
  const { useCase } = buildUseCase([
    [
      {
        name: "create_training_event",
        args: { workouts: [{ type: "free", duration: 30, calories: 150 }] },
      },
      { name: "create_meal_event", args: { inputText: "um sanduíche" } },
    ],
  ]);

  const result = await useCase.execute({ text: "treinei 30 min e comi um sanduíche" }, actor);

  expect(result.eventIds).toHaveLength(2);
  expect(result.skillsUsed).toEqual(["create_training_event", "create_meal_event"]);
});
