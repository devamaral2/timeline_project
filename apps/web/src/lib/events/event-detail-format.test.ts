import { describe, expect, it } from "vitest";
import { dateLineOf, formatMinutes, formatPace, groupSetsByExercise } from "./event-detail-format";

describe("event-detail-format", () => {
  it("formats minutes", () => {
    expect(formatMinutes(30)).toBe("30 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(450)).toBe("7 h 30");
  });

  it("formats pace", () => {
    expect(formatPace(6.25)).toBe("6′15″/km");
    expect(formatPace(5.999)).toBe("6′00″/km");
  });

  it("describes a single-day and an overnight window", () => {
    expect(dateLineOf("2026-09-14T10:00:00.000Z", "2026-09-14T11:00:00.000Z")).toBe("Segunda-feira, 14 de setembro");
    expect(dateLineOf("2026-09-14T02:10:00.000Z", "2026-09-14T09:40:00.000Z")).toBe("Domingo, 13 → segunda, 14 de setembro");
  });

  it("groups sets by exercise in order", () => {
    const sets = [
      { id: "1", exercise: "Supino", repetitions: 10, weight: 40 },
      { id: "2", exercise: "Remada", repetitions: 8, weight: 30 },
      { id: "3", exercise: "Supino", repetitions: 8, weight: 50 },
    ];
    expect(groupSetsByExercise(sets).map((g) => [g.exercise, g.sets.length])).toEqual([["Supino", 2], ["Remada", 1]]);
  });
});
