import { expect, test } from "vitest";
import { EDIT_TARGET_LABELS, editEntityTypeOfArtifact, isModelCommand } from "./entity-edit-target";

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

test("so /model sozinho no campo abre a escolha do modelo; /modelo e o modo modelo do chat", () => {
  const cases = ["/model", "/MODEL", "  /Model  ", "/modelo", "/models", "/model haiku", "model", "/", "mude o /model", ""];
  expect(cases.filter(isModelCommand)).toEqual(["/model", "/MODEL", "  /Model  "]);
});

test.each(["news", "email_summary", "youtube_transcript"] as const)("um artefato %s é editado pelo mesmo alvo da nota, sem entityType próprio", (type) => {
  expect(editEntityTypeOfArtifact({ type, global: false })).toBe("artifact");
  expect(editEntityTypeOfArtifact({ type, global: true })).toBeNull();
});
