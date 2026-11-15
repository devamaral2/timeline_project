import { expect, test } from "vitest";
import { artifactActor } from "./artifact-model";

test("skill, agente e roteador são notas de agentes; as demais são da pessoa", () => {
  expect((["skill", "agent", "router"] as const).map(artifactActor)).toEqual(["agent", "agent", "agent"]);
  expect((["text", "food", "sleep", "training", "workout"] as const).map(artifactActor)).toEqual(["human", "human", "human", "human", "human"]);
});
