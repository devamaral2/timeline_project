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
  location: "",
  startedAt: "2026-11-14T08:00:00-03:00",
  estimatedFinishAt: "2026-11-14T08:30:00-03:00",
  longRunning: false,
  notifyOffsetsMinutes: [10],
  tags: ["saude"],
  artifactTypes: ["training"],
  previousTaskIds: [],
  revision: 1,
};

test("um cartao de tarefa de exemplo passa no esquema do contrato compartilhado", () => {
  expect(taskCardSchema.parse(card)).toEqual(card);
});

test("o esquema do contrato recusa um cartao com status inventado", () => {
  expect(taskCardSchema.safeParse({ ...card, status: "inventado" }).success).toBe(false);
});
