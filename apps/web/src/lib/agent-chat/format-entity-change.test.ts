import { expect, test } from "vitest";
import { changeLines } from "./format-entity-change";

test("a moved event shows the old time as removed and the new one as added", () => {
  const lines = changeLines(
    [{ field: "time", before: "2026-09-15T07:00:00.000Z/2026-09-15T07:45:00.000Z", after: "2026-09-15T18:00:00.000Z/2026-09-15T18:45:00.000Z" }],
    "UTC",
  );
  expect(lines).toEqual([
    { sign: "-", label: "", value: "ter 15 set 07:00 — 07:45" },
    { sign: "+", label: "", value: "ter 15 set 18:00 — 18:45" },
  ]);
});

test("an end on another day carries its own day, and an open end shows only the start", () => {
  const [, added] = changeLines(
    [{ field: "time", before: "2026-09-15T07:00:00.000Z/", after: "2026-09-15T23:00:00.000Z/2026-09-16T00:30:00.000Z" }],
    "UTC",
  );
  expect(added.value).toBe("ter 15 set 23:00 — qua 16 set 00:30");
  expect(changeLines([{ field: "time", after: "2026-09-15T07:00:00.000Z/" }], "UTC")).toEqual([
    { sign: "+", label: "", value: "ter 15 set 07:00" },
  ]);
});

test("text fields keep their label and say what left and what came in", () => {
  expect(changeLines([{ field: "priority", before: "Normal", after: "Urgente" }])).toEqual([
    { sign: "-", label: "prioridade", value: "Normal" },
    { sign: "+", label: "prioridade", value: "Urgente" },
  ]);
});
