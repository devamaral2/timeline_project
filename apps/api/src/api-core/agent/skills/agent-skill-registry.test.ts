import { expect, test } from "vitest";
import { z } from "zod";
import { AGENT_SKILLS } from "./agent-skill-registry";

/** Mesma conversao que o SDK do agente aplica antes de enviar as tools. */
function wireSchema(name: string): string {
  const skill = AGENT_SKILLS.find((candidate) => candidate.name === name);
  if (!skill) throw new Error(`skill ${name} not found`);
  return JSON.stringify(z.toJSONSchema(skill.parameters, { target: "draft-7" }));
}

test("no tool serializes a union as oneOf", () => {
  // function calling da familia OpenAI aceita `anyOf`, mas nao `oneOf`.
  for (const skill of AGENT_SKILLS) {
    expect(wireSchema(skill.name)).not.toContain('"oneOf"');
  }
  expect(wireSchema("save_training_event")).toContain('"anyOf"');
});

test("wire schemas keep the unit hints the agent depends on", () => {
  expect(wireSchema("save_training_event")).toContain("Duração em MINUTOS.");
  expect(wireSchema("save_training_event")).toContain("Distância em QUILÔMETROS.");
  expect(wireSchema("save_sleep_event")).toContain("Tempo dormido em MINUTOS.");
});

test("tool names are unique and no tool accepts a user id", () => {
  const names = AGENT_SKILLS.map((skill) => skill.name);
  expect(new Set(names).size).toBe(names.length);

  for (const skill of AGENT_SKILLS) {
    expect(Object.keys(skill.parameters.shape)).not.toContain("userId");
  }
});

test("invalid arguments come back as a tool error instead of throwing", async () => {
  const task = AGENT_SKILLS.find((skill) => skill.name === "save_task");

  const result = await task?.run({ status: "whatever" }, {} as never);

  expect(result).toMatchObject({ ok: false });
});
