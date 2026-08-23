import { expect, test } from "vitest";
import { TrainingEvent } from "../../domain/entities/training-event.entity";
import { EventAgentUndecidedError, InvalidInputError } from "../errors/event-agent.errors";
import { CreateEventFromTextUseCase } from "./create-event-from-text.usecase";
import { CreateEventUseCase } from "./create-event.usecase";
import { InMemoryEventRepository } from "./test-doubles/in-memory-event.repository";
import { InMemoryTagRepository } from "./test-doubles/in-memory-tag.repository";
import { ScriptedEventAgentGateway } from "./test-doubles/scripted-event-agent.gateway";
import { StubFoodParsingGateway } from "./test-doubles/stub-food-parsing.gateway";
import type { ScriptedAgentCall } from "./test-doubles/scripted-event-agent.gateway";

const actor = { userId: "firebase-user-1" };

function buildUseCase(rounds: ScriptedAgentCall[][], foodItems?: StubFoodParsingGateway) {
  const eventRepository = new InMemoryEventRepository();
  const tagRepository = new InMemoryTagRepository();
  const agentGateway = new ScriptedEventAgentGateway(rounds);
  const useCase = new CreateEventFromTextUseCase(
    agentGateway,
    new CreateEventUseCase(
      eventRepository,
      tagRepository,
      foodItems ?? new StubFoodParsingGateway(),
    ),
  );

  return { useCase, eventRepository, tagRepository, agentGateway };
}

test("creates a training event from the skill the agent chose", async () => {
  const { useCase, eventRepository, tagRepository } = buildUseCase([
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
  expect(savedEvent).toBeInstanceOf(TrainingEvent);
  expect(savedEvent?.name).toBe("Treino");
  expect(savedEvent?.data).toMatchObject({
    caloriesBurned: 300,
    workouts: [{ type: "running", distance: 5, duration: 90, pace: 18, calories: 300 }],
  });
  expect(tagRepository.upsertedTags).toEqual(["corrida"]);
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
    "create_food_event",
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
  expect(await eventRepository.findById(result.eventIds[0])).toBeInstanceOf(TrainingEvent);
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
  await expect(eventRepository.listTimeline({ userId: actor.userId })).resolves.toEqual([]);
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
      { name: "create_food_event", args: { inputText: "um sanduíche" } },
    ],
  ]);

  const result = await useCase.execute({ text: "treinei 30 min e comi um sanduíche" }, actor);

  expect(result.eventIds).toHaveLength(2);
  expect(result.skillsUsed).toEqual(["create_training_event", "create_food_event"]);
});
