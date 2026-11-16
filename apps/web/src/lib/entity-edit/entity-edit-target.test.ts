import { expect, test } from "vitest";
import { EDIT_TARGET_LABELS, editEntityTypeOfArtifact } from "./entity-edit-target";

test.each([
  ["text", "artifact"],
  ["food", "food_artifact"],
  ["sleep", "sleep_artifact"],
  ["training", "training_artifact"],
  ["skill", "skill_artifact"],
  ["agent", "agent_artifact"],
] as const)("um artefato do tipo %s é editado como %s", (type, entityType) => {
  expect(editEntityTypeOfArtifact({ type, global: false })).toBe(entityType);
});

test("um artefato global não tem barra de edição, qualquer que seja o tipo", () => {
  expect(editEntityTypeOfArtifact({ type: "text", global: true })).toBeNull();
  expect(editEntityTypeOfArtifact({ type: "workout", global: true })).toBeNull();
});

test("roteador e exercício não têm barra de edição", () => {
  expect(editEntityTypeOfArtifact({ type: "router", global: false })).toBeNull();
  expect(editEntityTypeOfArtifact({ type: "workout", global: false })).toBeNull();
});

test("cada tipo que a API aceita tem o texto que o campo mostra", () => {
  expect(EDIT_TARGET_LABELS).toEqual({
    task: "esta tarefa",
    artifact: "esta nota",
    food_artifact: "esta refeição",
    sleep_artifact: "esta nota de sono",
    training_artifact: "este treino",
    skill_artifact: "esta skill",
    agent_artifact: "este agente",
  });
});
