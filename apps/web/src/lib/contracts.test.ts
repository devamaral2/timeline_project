import type { TaskCardDto } from "@repo/contracts";
import { taskCardSchema } from "@repo/contracts/schemas";
import { expect, test } from "vitest";

const card: TaskCardDto = {
  id: "task-1",
  actor: "human",
  kind: "common",
  status: "todo",
  priority: "medium",
  name: "Caminhada",
  description: "",
  project: { id: "project-1", name: "personal", personal: true },
  startedAt: "2026-11-14T08:00:00-03:00",
  estimatedFinishAt: "2026-11-14T08:30:00-03:00",
  longRunning: false,
  notifyOffsetsMinutes: [10],
  tags: ["saude"],
  artifactTypes: ["training"],
  revision: 1,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

test("um cartao de tarefa de exemplo passa no esquema do contrato compartilhado", () => {
  expect(taskCardSchema.parse(card)).toEqual(card);
});

test("o esquema do contrato recusa um cartao com status inventado", () => {
  expect(taskCardSchema.safeParse({ ...card, status: "inventado" }).success).toBe(false);
});

test("o esquema do contrato recusa um cartao sem projeto", () => {
  const { project: _project, ...withoutProject } = card;
  expect(taskCardSchema.safeParse(withoutProject).success).toBe(false);
});
