import type { AgentEntityItem } from "@repo/contracts";
import { describe, expect, test } from "vitest";
import { entityChanges } from "./agent-entity-changes";

const event = (overrides: Partial<Extract<AgentEntityItem, { kind: "event" }>> = {}): AgentEntityItem => ({
  kind: "event",
  eventKind: "routine",
  id: "e1",
  name: "Treino de mobilidade",
  description: "",
  startedAt: "2026-09-15T07:00:00.000Z",
  finishedAt: "2026-09-15T07:45:00.000Z",
  tags: [],
  missed: false,
  priority: "normal",
  notifyOffsetsMinutes: [],
  interruptions: [],
  revision: 1,
  notes: [],
  ...overrides,
});

describe("entityChanges", () => {
  test("a moved event lists the old interval as removed and the new one as added", () => {
    const changes = entityChanges(
      event(),
      event({ startedAt: "2026-09-15T18:00:00.000Z", finishedAt: "2026-09-15T18:45:00.000Z" }),
    );
    expect(changes).toEqual([
      {
        field: "time",
        before: "2026-09-15T07:00:00.000Z/2026-09-15T07:45:00.000Z",
        after: "2026-09-15T18:00:00.000Z/2026-09-15T18:45:00.000Z",
      },
    ]);
  });

  test("an unchanged event has no diff", () => {
    expect(entityChanges(event(), event({ revision: 2 }))).toEqual([]);
  });

  test("a created event only has what was added", () => {
    expect(entityChanges(undefined, event())).toEqual([
      { field: "time", after: "2026-09-15T07:00:00.000Z/2026-09-15T07:45:00.000Z" },
    ]);
  });

  test("renaming and re-prioritising show readable values", () => {
    expect(entityChanges(event(), event({ name: "Alongamento", priority: "urgent" }))).toEqual([
      { field: "name", before: "Treino de mobilidade", after: "Alongamento" },
      { field: "priority", before: "Normal", after: "Urgente" },
    ]);
  });
});
