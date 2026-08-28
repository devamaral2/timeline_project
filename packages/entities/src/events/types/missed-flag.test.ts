import { describe, expect, test } from "vitest";
import { readMissedFlag } from "./missed-flag";

describe("readMissedFlag", () => {
  test("reads the flag the user set", () => {
    expect(readMissedFlag({ missed: true })).toBe(true);
    expect(readMissedFlag({ missed: false })).toBe(false);
  });

  test("reads the missed status of the previous version as the flag", () => {
    expect(readMissedFlag({ status: "missed" })).toBe(true);
  });

  test("does not turn the other statuses of the previous version into a mark", () => {
    // Aqueles status falavam de planejamento, nao de o usuario ter perdido o
    // evento. Traduzi-los seria inventar anotacoes que ninguem fez.
    for (const status of ["draft", "scheduled", "in_progress", "completed", "archived"]) {
      expect(readMissedFlag({ status })).toBe(false);
    }
  });

  test("leaves a document without any of the two fields unmarked", () => {
    expect(readMissedFlag({})).toBe(false);
    expect(readMissedFlag({ missed: "sim" })).toBe(false);
  });
});
