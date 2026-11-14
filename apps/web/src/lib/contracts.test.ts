import type { EventCardDto } from "@repo/contracts";
import { eventCardSchema } from "@repo/contracts/schemas";
import { expect, test } from "vitest";

const card: EventCardDto = {
  id: "event-1",
  actor: "human",
  kind: "routine",
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
  parentEventIds: [],
  blockedByEventIds: [],
  revision: 1,
};

test("um cartao de evento de exemplo passa no esquema do contrato compartilhado", () => {
  expect(eventCardSchema.parse(card)).toEqual(card);
});

test("o esquema do contrato recusa um cartao com status inventado", () => {
  expect(eventCardSchema.safeParse({ ...card, status: "inventado" }).success).toBe(false);
});
