import { describe, expect, it } from "vitest";
import type { EventCardDto } from "@repo/contracts";
import { eventFixture } from "@/test/fake-api/events";
import {
  type SubtaskRow,
  SUBTASK_NAME_MESSAGE,
  planSubtaskChanges,
  rebaseSubtaskRows,
  subtaskPlanHasWork,
  validateSubtaskRows,
} from "./event-subtask-draft";

function card(id: string, name: string, revision = 1): EventCardDto {
  const { artifacts: _artifacts, subtaskEventIds: _subtasks, blocksEventIds: _blocks, ...rest } = eventFixture({ id, name, revision, status: "todo" });
  return rest;
}

function row(overrides: Partial<SubtaskRow> & { key: string }): SubtaskRow {
  return { id: null, revision: 0, loadedName: "", name: "", removed: false, ...overrides };
}

describe("rebaseSubtaskRows", () => {
  it("o nome digitado fica, e o que não foi tocado passa a valer o da versão nova", () => {
    const rows = rebaseSubtaskRows([], [card("sub-1", "Aquecer", 2), card("sub-2", "Alongar", 2)]);
    const edited = rows.map((r) => (r.id === "sub-1" ? { ...r, name: "Aquecer bem" } : r));

    const next = rebaseSubtaskRows(edited, [card("sub-1", "Aquecer leve", 5), card("sub-2", "Alongar mais", 3)]);

    expect(next.find((r) => r.id === "sub-1")).toEqual(expect.objectContaining({ name: "Aquecer bem", loadedName: "Aquecer leve", revision: 5 }));
    expect(next.find((r) => r.id === "sub-2")).toEqual(expect.objectContaining({ name: "Alongar mais", revision: 3 }));
  });

  it("uma linha nova fica; uma subtarefa que sumiu sai; uma que apareceu entra", () => {
    const fresh = row({ key: "k-new", name: "Supino" });
    const rows = [row({ key: "sub-1", id: "sub-1", loadedName: "Aquecer", name: "Aquecer" }), fresh];

    const next = rebaseSubtaskRows(rows, [card("sub-3", "Caminhar")]);

    expect(next.map((r) => r.key)).toEqual(["k-new", "sub-3"]);
  });
});

describe("planSubtaskChanges", () => {
  it("separa remoção, renomeação e criação, e a lista que fica segue sem as removidas", () => {
    const plan = planSubtaskChanges([
      row({ key: "sub-1", id: "sub-1", revision: 2, loadedName: "Aquecer", name: "Aquecer  " }),
      row({ key: "sub-2", id: "sub-2", revision: 2, loadedName: "Alongar", name: "Alongar", removed: true }),
      row({ key: "k-new", name: "Supino" }),
      row({ key: "k-gone", name: "Nunca salvo", removed: true }),
    ]);

    expect(plan).toEqual({
      keptIds: ["sub-1"],
      removedIds: ["sub-2"],
      renames: [],
      creates: [{ key: "k-new", name: "Supino" }],
    });
    expect(subtaskPlanHasWork(plan)).toBe(true);
  });

  it("nome igual ao lido, sem remoção nem criação, não tem trabalho", () => {
    const plan = planSubtaskChanges([row({ key: "sub-1", id: "sub-1", revision: 2, loadedName: "Aquecer", name: "Aquecer" })]);
    expect(subtaskPlanHasWork(plan)).toBe(false);
  });
});

describe("validateSubtaskRows", () => {
  it("uma linha sem nome, nova ou existente, é recusada; uma removida não conta", () => {
    const errors = validateSubtaskRows([
      row({ key: "a", name: "  " }),
      row({ key: "b", id: "sub-1", loadedName: "Aquecer", name: "" }),
      row({ key: "c", id: "sub-2", loadedName: "Alongar", name: "", removed: true }),
    ]);

    expect(errors).toEqual({ a: SUBTASK_NAME_MESSAGE, b: SUBTASK_NAME_MESSAGE });
  });
});
