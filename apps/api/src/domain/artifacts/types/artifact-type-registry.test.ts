import { describe, expect, test } from "vitest";
import { ARTIFACT_TYPES, GLOBAL_ARTIFACT_TYPES } from "../../sets";
import { ArtifactValidationError } from "../errors/artifact.errors";
import { isAgentFileArtifactType, isRouterArtifactType, parseAgentFileData } from "./agent-file-data";
import {
  ArtifactTypeRegistry,
  DEFAULT_ARTIFACT_TYPE,
  defaultArtifactTypeRegistry,
  isArtifactType,
  isGlobalArtifactType,
} from "./artifact-type-registry";
import { parseSleepData } from "./sleep-data";
import { parseTextData } from "./text-data";
import { parseTrainingData } from "./training-data";
import { parseWorkoutData } from "./workout-data";

const validFood = {
  description: "Arroz e feijão",
  items: [
    {
      name: "Arroz",
      portion: "100 g",
      approximateWeightGrams: 100,
      caloriesKcal: 130,
      macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2.7, totalFatGrams: 0.3, fiberGrams: 0.4 },
    },
  ],
  totals: {
    totalCaloriesKcal: 130,
    totalProteinGrams: 2.7,
    totalCarbohydrateGrams: 28,
    totalFatGrams: 0.3,
    totalFiberGrams: 0.4,
  },
};

const running = { workoutCode: "running", workoutName: "Corrida", calories: 300, duration: 30, pace: 5, distance: 5 };
const validTraining = { workouts: [running], caloriesBurned: 300 };
const validAgentFile = { path: "hermes/skills/agenda/SKILL.md", hash: "0f".repeat(32), missing: false };

const validByType: Record<(typeof ARTIFACT_TYPES)[number], unknown> = {
  text: { body: "Lembrete" },
  news: { body: "# Manchetes\n\n- [Uma notícia](https://example.com/a)" },
  email_summary: { body: "Três mensagens pedem resposta." },
  youtube_transcript: { body: "00:00 Abertura" },
  food: validFood,
  sleep: { trackedSleepTime: 420, score: 85 },
  training: validTraining,
  workout: { code: "running", category: "cardio", active: true },
  skill: validAgentFile,
  agent: { ...validAgentFile, path: "hermes/agents/planner.md" },
  router: { body: "Rota por passos" },
};

describe("defaultArtifactTypeRegistry", () => {
  test("knows every artifact type of the domain, at schema version 1", () => {
    for (const type of ARTIFACT_TYPES) {
      expect(defaultArtifactTypeRegistry.getDefinition(type), type).toMatchObject({ type, currentSchemaVersion: 1 });
    }
  });

  test("parses a valid payload of every type", () => {
    for (const type of ARTIFACT_TYPES) {
      const parsed = defaultArtifactTypeRegistry.parse(type, validByType[type], 1);

      expect(parsed.schemaVersion, type).toBe(1);
      expect(parsed.data, type).toMatchObject(validByType[type] as object);
    }
  });

  test("rejects an unknown type, including the old note types", () => {
    expect(() => defaultArtifactTypeRegistry.parse("meal", {}, 1)).toThrow("Unknown artifact type: meal");
    expect(() => defaultArtifactTypeRegistry.parse("note", { body: "x" }, 1)).toThrow(ArtifactValidationError);
    expect(defaultArtifactTypeRegistry.getDefinition("meal")).toBeUndefined();
  });

  test("rejects an unsupported schema version for every type", () => {
    for (const type of ARTIFACT_TYPES) {
      expect(() => defaultArtifactTypeRegistry.parse(type, validByType[type], 2), type).toThrow(
        "Unsupported schema version",
      );
    }
  });

  test("rejects data that is not an object for every type", () => {
    for (const type of ARTIFACT_TYPES) {
      expect(() => defaultArtifactTypeRegistry.parse(type, null, 1), type).toThrow(ArtifactValidationError);
      expect(() => defaultArtifactTypeRegistry.parse(type, "texto", 1), type).toThrow(ArtifactValidationError);
    }
  });

  test("a router is stored as a text", () => {
    expect(defaultArtifactTypeRegistry.parse("router", { body: "JEV", other: 1 }, 1).data).toEqual({ body: "JEV" });
    expect(() => defaultArtifactTypeRegistry.parse("router", { body: "" }, 1)).toThrow("Text artifact requires a body");
  });
});

describe("ArtifactTypeRegistry", () => {
  test("answers with the current schema version of the definition, not the one that came in", () => {
    const registry = new ArtifactTypeRegistry([
      { type: "text", currentSchemaVersion: 3, parse: (data, schemaVersion) => ({ data, from: schemaVersion }) },
    ]);

    expect(registry.parse("text", { body: "x" }, 1)).toEqual({ schemaVersion: 3, data: { data: { body: "x" }, from: 1 } });
  });

  test("only knows the types it was built with", () => {
    const registry = new ArtifactTypeRegistry([{ type: "text", currentSchemaVersion: 1, parse: parseTextData }]);

    expect(() => registry.parse("sleep", { trackedSleepTime: 1, score: 1 }, 1)).toThrow("Unknown artifact type: sleep");
  });
});

describe("type guards", () => {
  test("text is the type of an artifact created without one", () => {
    expect(DEFAULT_ARTIFACT_TYPE).toBe("text");
  });

  test("isArtifactType accepts only the domain types", () => {
    for (const type of ARTIFACT_TYPES) expect(isArtifactType(type)).toBe(true);
    expect(isArtifactType("meal")).toBe(false);
    expect(isArtifactType(undefined)).toBe(false);
  });

  test("only food and workout can be global", () => {
    expect(GLOBAL_ARTIFACT_TYPES).toEqual(["food", "workout"]);
    expect(ARTIFACT_TYPES.filter(isGlobalArtifactType)).toEqual(["food", "workout"]);
  });

  test("skill and agent are the agent-file types, and router is its own read-only type", () => {
    expect(ARTIFACT_TYPES.filter(isAgentFileArtifactType)).toEqual(["skill", "agent"]);
    expect(ARTIFACT_TYPES.filter(isRouterArtifactType)).toEqual(["router"]);
  });
});

describe("parseTextData", () => {
  test("keeps the body as written", () => {
    expect(parseTextData({ body: "  # Titulo\n\n- item  " }, 1)).toEqual({ body: "  # Titulo\n\n- item  " });
  });

  test("rejects a missing, blank or non-text body", () => {
    expect(() => parseTextData({}, 1)).toThrow("Text artifact requires a body");
    expect(() => parseTextData({ body: " \n " }, 1)).toThrow("Text artifact requires a body");
    expect(() => parseTextData({ body: 42 }, 1)).toThrow("Text artifact requires a body");
  });
});

describe("parseSleepData", () => {
  test("keeps the tracked time and the score", () => {
    expect(parseSleepData({ trackedSleepTime: 0, score: 0, extra: 1 }, 1)).toEqual({ trackedSleepTime: 0, score: 0 });
  });

  test("rejects a missing or non-finite number", () => {
    expect(() => parseSleepData({ score: 80 }, 1)).toThrow("Sleep data requires a numeric trackedSleepTime");
    expect(() => parseSleepData({ trackedSleepTime: 420, score: Number.NaN }, 1)).toThrow(
      "Sleep data requires a numeric score",
    );
    expect(() => parseSleepData({ trackedSleepTime: "420", score: 80 }, 1)).toThrow(ArtifactValidationError);
  });
});

describe("parseTrainingData", () => {
  const weightlifting = {
    workoutCode: "weightlifting",
    workoutName: "Musculação",
    calories: 200,
    duration: 45,
    sets: [{ exercise: "Supino", repetitions: 10, weight: 60 }],
  };
  const free = { workoutCode: "free", workoutName: "Livre", calories: 120, duration: 20 };

  test("parses cardio, weightlifting and free workouts, giving ids to what has none", () => {
    const parsed = parseTrainingData({ workouts: [running, weightlifting, { ...free, id: "w-3" }], caloriesBurned: 620 }, 1);

    expect(parsed.caloriesBurned).toBe(620);
    expect(parsed.workouts).toMatchObject([
      { workoutCode: "running", pace: 5, distance: 5 },
      { workoutCode: "weightlifting", sets: [{ exercise: "Supino", repetitions: 10, weight: 60 }] },
      { id: "w-3", workoutCode: "free" },
    ]);
    expect(parsed.workouts[0]?.id).toMatch(/^[0-9A-Z]{26}$/);
    expect((parsed.workouts[1] as { sets: { id: string }[] }).sets[0]?.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(parsed.workouts[2]).not.toHaveProperty("pace");
  });

  test("accepts a training without workouts", () => {
    expect(parseTrainingData({ workouts: [], caloriesBurned: 0 }, 1)).toEqual({ workouts: [], caloriesBurned: 0 });
  });

  test("requires caloriesBurned to be the sum of the workouts", () => {
    expect(() => parseTrainingData({ workouts: [running, free], caloriesBurned: 300 }, 1)).toThrow(
      "caloriesBurned does not match the sum of workouts",
    );
    expect(() => parseTrainingData({ workouts: [running] }, 1)).toThrow(
      "Training data requires non-negative caloriesBurned",
    );
  });

  test("rejects an unknown workout code and a workout without its fields", () => {
    const withWorkout = (workout: unknown) => () => parseTrainingData({ workouts: [workout], caloriesBurned: 0 }, 1);

    expect(withWorkout({ ...running, workoutCode: "swimming" })).toThrow("Workout requires a known workoutCode");
    expect(withWorkout({ ...running, workoutName: "" })).toThrow("Workout requires a workoutName");
    expect(withWorkout({ ...running, calories: -1 })).toThrow("Workout requires non-negative calories");
    expect(withWorkout({ ...running, duration: undefined })).toThrow("Workout requires non-negative duration");
    expect(withWorkout({ ...running, pace: undefined })).toThrow("Cardio workout requires non-negative pace");
    expect(withWorkout({ ...running, distance: -1 })).toThrow("Cardio workout requires non-negative distance");
    expect(withWorkout({ ...weightlifting, sets: undefined })).toThrow("Weightlifting workout requires an array of sets");
    expect(withWorkout({ ...weightlifting, sets: [{ repetitions: 10, weight: 60 }] })).toThrow(
      "Workout set requires an exercise",
    );
    expect(withWorkout({ ...weightlifting, sets: [{ exercise: "Supino", repetitions: -1, weight: 60 }] })).toThrow(
      "Workout set requires non-negative repetitions",
    );
    expect(withWorkout({ ...weightlifting, sets: [{ exercise: "Supino", repetitions: 10 }] })).toThrow(
      "Workout set requires non-negative weight",
    );
    expect(withWorkout(null)).toThrow("Workout must be an object");
  });

  test("requires the list of workouts", () => {
    expect(() => parseTrainingData({ caloriesBurned: 0 }, 1)).toThrow("Training data requires an array of workouts");
  });
});

describe("parseWorkoutData", () => {
  test("parses a catalog exercise, active unless said otherwise", () => {
    expect(parseWorkoutData({ code: "running", category: "cardio" }, 1)).toEqual({
      code: "running",
      category: "cardio",
      active: true,
    });
    expect(parseWorkoutData({ code: "free", category: "free", active: false }, 1).active).toBe(false);
  });

  test("requires a code and a known category", () => {
    expect(() => parseWorkoutData({ category: "cardio" }, 1)).toThrow("Workout requires a code");
    expect(() => parseWorkoutData({ code: "", category: "cardio" }, 1)).toThrow("Workout requires a code");
    expect(() => parseWorkoutData({ code: "running", category: "aerobic" }, 1)).toThrow(
      "Workout requires a known category",
    );
  });
});

describe("parseAgentFileData", () => {
  test("keeps the reference to the file and drops an empty description", () => {
    expect(parseAgentFileData({ ...validAgentFile, description: "Agenda do usuario", extra: 1 }, 1)).toEqual({
      ...validAgentFile,
      description: "Agenda do usuario",
    });
    expect(parseAgentFileData({ ...validAgentFile, description: "" }, 1)).toEqual(validAgentFile);
  });

  test("only accepts a markdown path inside hermes/, without leaving the folder", () => {
    const withPath = (path: unknown) => () => parseAgentFileData({ ...validAgentFile, path }, 1);

    expect(withPath("skills/agenda/SKILL.md")).toThrow("Agent file artifact requires a path inside hermes/ ending in .md");
    expect(withPath("hermes/skills/agenda/SKILL.txt")).toThrow(ArtifactValidationError);
    expect(withPath("hermes/../secrets.md")).toThrow(ArtifactValidationError);
    expect(withPath(undefined)).toThrow(ArtifactValidationError);
  });

  test("requires a sha-256 hash, the missing flag and a text description", () => {
    expect(() => parseAgentFileData({ ...validAgentFile, hash: "abc" }, 1)).toThrow(
      "Agent file artifact requires a sha-256 hash",
    );
    expect(() => parseAgentFileData({ ...validAgentFile, hash: "A".repeat(64) }, 1)).toThrow(ArtifactValidationError);
    expect(() => parseAgentFileData({ ...validAgentFile, missing: undefined }, 1)).toThrow(
      "Agent file artifact requires missing",
    );
    expect(() => parseAgentFileData({ ...validAgentFile, description: 1 }, 1)).toThrow(
      "Agent file artifact description must be a string",
    );
  });
});
