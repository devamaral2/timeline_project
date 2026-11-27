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

const agentCard: TaskCardDto = { ...card, actor: "agent", kind: "request", status: "completed", artifactTypes: [], tags: [] };

test("o esquema do contrato aceita um cartao de agente com cada um dos dez status", () => {
  for (const status of ["preparing", "queued", "starting", "running", "waiting", "completed", "interrupted", "failed", "cancelled", "rolled_back"] as const) {
    expect(taskCardSchema.safeParse({ ...agentCard, status }).success, status).toBe(true);
  }
});

test("o esquema do contrato recusa um cartao de agente com done ou cancel", () => {
  expect(taskCardSchema.safeParse({ ...agentCard, status: "done" }).success).toBe(false);
  expect(taskCardSchema.safeParse({ ...agentCard, status: "cancel" }).success).toBe(false);
});

test("o esquema do contrato recusa um cartao de pessoa com status de agente", () => {
  for (const status of ["completed", "cancelled", "queued", "failed"]) {
    expect(taskCardSchema.safeParse({ ...card, status }).success, status).toBe(false);
  }
  expect(taskCardSchema.safeParse({ ...card, status: "done" }).success).toBe(true);
});
