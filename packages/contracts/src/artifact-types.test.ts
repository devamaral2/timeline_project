import { expect, test } from "vitest";
import { hasTextBody, isFreeTextArtifact, isFreeTextArtifactType, isTextBodyArtifactType } from "./artifact-types";

const ALL_TYPES = ["text", "food", "sleep", "training", "workout", "skill", "agent", "router"] as const;

test("de texto livre, hoje, só a nota", () => {
  expect(ALL_TYPES.filter(isFreeTextArtifactType)).toEqual(["text"]);
});

test("têm corpo em markdown a nota e o roteador; o roteador não é de texto livre", () => {
  expect(ALL_TYPES.filter(isTextBodyArtifactType)).toEqual(["text", "router"]);
  expect(isFreeTextArtifactType("router")).toBe(false);
});

test("um tipo desconhecido ou um valor que não é texto fica fora dos dois", () => {
  for (const value of ["something-new", "", undefined, null, 1]) {
    expect(isFreeTextArtifactType(value)).toBe(false);
    expect(isTextBodyArtifactType(value)).toBe(false);
  }
});

test("os predicados de artefato decidem pelo tipo e dão acesso ao corpo", () => {
  const note = { type: "text" as const, data: { body: "# Ideias" } };
  const router = { type: "router" as const, data: { body: "regras" } };
  const food = { type: "food" as const, data: { calories: 120 } };
  const artifacts: Array<typeof note | typeof router | typeof food> = [note, router, food];

  expect(artifacts.filter(isFreeTextArtifact).map((artifact) => artifact.data.body)).toEqual(["# Ideias"]);
  expect(artifacts.filter(hasTextBody).map((artifact) => artifact.data.body)).toEqual(["# Ideias", "regras"]);
});
