import { expect, test } from "vitest";
import { z } from "zod";
import { EVENT_SKILLS, findEventSkill } from "./event-skill-registry";

/** Mesma conversão que o SDK do agente aplica antes de enviar as tools. */
function wireSchema(skillName: string) {
  const skill = findEventSkill(skillName);
  if (!skill) throw new Error(`skill ${skillName} not found`);
  return JSON.stringify(z.toJSONSchema(skill.parameters, { target: "draft-7" }));
}

test("no skill serializes a union as oneOf", () => {
  // function calling da família OpenAI aceita `anyOf`, mas não `oneOf` — uma
  // z.discriminatedUnion aqui faria o provedor rejeitar a tool com 400.
  for (const skill of EVENT_SKILLS) {
    expect(wireSchema(skill.name)).not.toContain('"oneOf"');
  }
  expect(wireSchema("create_training_event")).toContain('"anyOf"');
});

test("wire schemas keep the unit hints the agent depends on", () => {
  const training = wireSchema("create_training_event");

  expect(training).toContain("Duração em MINUTOS.");
  expect(training).toContain("Distância em QUILÔMETROS.");
  expect(wireSchema("create_sleep_event")).toContain("Tempo dormido em MINUTOS.");
});

test("every skill is uniquely addressable by name", () => {
  const names = EVENT_SKILLS.map((skill) => skill.name);

  expect(new Set(names).size).toBe(names.length);
  for (const name of names) expect(findEventSkill(name)?.name).toBe(name);
  expect(findEventSkill("create_unknown_event")).toBeUndefined();
});

test("training skill maps a run to a running workout", () => {
  const skill = findEventSkill("create_training_event");

  // "Corri 5 km, por uma hora e meia e queimei 300 calorias"
  expect(
    skill?.toCreateEventInput({
      workouts: [{ type: "running", distance: 5, duration: 90, pace: 18, calories: 300 }],
      tags: ["corrida"],
    }),
  ).toEqual({
    type: "training",
    tags: ["corrida"],
    data: {
      workouts: [{ type: "running", distance: 5, duration: 90, pace: 18, calories: 300 }],
    },
  });
});

test("training skill keeps weightlifting sets", () => {
  const skill = findEventSkill("create_training_event");

  expect(
    skill?.toCreateEventInput({
      workouts: [
        {
          type: "weightlifting",
          duration: 45,
          calories: 200,
          sets: [{ exercise: "supino reto", repetitions: 10, weight: 60 }],
        },
      ],
    }),
  ).toEqual({
    type: "training",
    data: {
      workouts: [
        {
          type: "weightlifting",
          duration: 45,
          calories: 200,
          sets: [{ exercise: "supino reto", repetitions: 10, weight: 60 }],
        },
      ],
    },
  });
});

test("food skill only relays the meal text, leaving nutrition to the food pipeline", () => {
  const skill = findEventSkill("create_food_event");

  expect(
    skill?.toCreateEventInput({ inputText: "dois ovos mexidos e uma fatia de pão integral" }),
  ).toEqual({
    type: "food",
    inputText: "dois ovos mexidos e uma fatia de pão integral",
  });
});

test("sleep skill maps minutes and score", () => {
  const skill = findEventSkill("create_sleep_event");

  expect(skill?.toCreateEventInput({ trackedSleepTime: 450, score: 82 })).toEqual({
    type: "sleep",
    data: { trackedSleepTime: 450, score: 82 },
  });
});

test("routine skill carries the name through", () => {
  const skill = findEventSkill("create_routine_event");

  expect(
    skill?.toCreateEventInput({ name: "Reunião de planejamento", description: "com o time" }),
  ).toEqual({
    type: "routine",
    name: "Reunião de planejamento",
    description: "com o time",
  });
});

test("skills reject arguments that violate their schema", () => {
  const training = findEventSkill("create_training_event");
  const sleep = findEventSkill("create_sleep_event");

  // workouts vazio
  expect(() => training?.toCreateEventInput({ workouts: [] })).toThrow();
  // type de workout inexistente
  expect(() =>
    training?.toCreateEventInput({ workouts: [{ type: "swimming", duration: 30, calories: 10 }] }),
  ).toThrow();
  // score fora da faixa 0-100
  expect(() => sleep?.toCreateEventInput({ trackedSleepTime: 450, score: 900 })).toThrow();
  // campo obrigatório ausente
  expect(() => findEventSkill("create_routine_event")?.toCreateEventInput({})).toThrow();
});

test("empty optional fields are omitted rather than sent as empty values", () => {
  const skill = findEventSkill("create_routine_event");

  expect(skill?.toCreateEventInput({ name: "Estudar", tags: [], description: "" })).toEqual({
    type: "routine",
    name: "Estudar",
  });
});
