import { afterEach, expect, test, vi } from "vitest";
import {
  OpenRouterEventCommandParsingGateway,
  toCreateEventInput,
  toEventSchedule,
  type RawEventCommand,
} from "./openrouter-event-command-parsing.gateway";

afterEach(() => {
  vi.restoreAllMocks();
});

function aRawCommand(overrides: Partial<RawEventCommand> = {}): Partial<RawEventCommand> {
  return {
    type: "routine",
    routineName: "",
    foodInputText: "",
    sleepHours: null,
    sleepScore: null,
    workoutKind: "free",
    workoutDurationMinutes: null,
    workoutCalories: null,
    workoutDistanceKm: null,
    startTimeOfDay: "",
    startOffsetMinutes: null,
    durationMinutes: null,
    endTimeOfDay: "",
    ...overrides,
  };
}

test("requests the strict event_command schema and returns the parsed input", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(aRawCommand({ type: "routine", routineName: "Estudar ingles" })),
          },
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const gateway = new OpenRouterEventCommandParsingGateway("test-api-key", "x-ai/grok-4.5", {
    build: () => "command prompt",
  });

  const result = await gateway.parseCommand({ text: "comecei a estudar ingles" });

  expect(result).toEqual({
    input: { type: "routine", name: "Estudar ingles", tags: [] },
    schedule: {
      startTimeOfDay: undefined,
      startOffsetMinutes: undefined,
      durationMinutes: undefined,
      endTimeOfDay: undefined,
    },
    modelProvider: "openrouter",
    modelName: "x-ai/grok-4.5",
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "https://openrouter.ai/api/v1/chat/completions",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-api-key" }),
    }),
  );

  const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
    response_format: { type: string; json_schema?: { name: string; strict: boolean } };
  };
  expect(request.response_format).toEqual(
    expect.objectContaining({
      type: "json_schema",
      json_schema: expect.objectContaining({ name: "event_command", strict: true }),
    }),
  );
});

test("never logs the api key", async () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(aRawCommand()) } }],
      }),
    }),
  );
  const gateway = new OpenRouterEventCommandParsingGateway("super-secret-key", "model", {
    build: () => "prompt",
  });

  await gateway.parseCommand({ text: "oi" });

  const logged = JSON.stringify(logSpy.mock.calls);
  expect(logged).not.toContain("super-secret");
});

test("falls back to the transcript when the model leaves the routine name empty", () => {
  const input = toCreateEventInput(aRawCommand({ type: "routine", routineName: "  " }), "  fui correr no parque  ");

  expect(input).toEqual({ type: "routine", name: "fui correr no parque", tags: [] });
});

test("falls back to routine when the model returns an unknown type", () => {
  const input = toCreateEventInput(aRawCommand({ type: "meditation" }), "meditei 10 minutos");

  expect(input).toEqual({ type: "routine", name: "meditei 10 minutos", tags: [] });
});

test("reads sleep values above 24 as minutes", () => {
  const input = toCreateEventInput(
    aRawCommand({ type: "sleep", sleepHours: 450, sleepScore: 80 }),
    "dormi",
  );

  expect(input).toEqual({
    type: "sleep",
    data: { trackedSleepTime: 7.5, score: 80 },
    tags: [],
  });
});

test("clamps the sleep score and drops a missing duration", () => {
  const input = toCreateEventInput(
    aRawCommand({ type: "sleep", sleepHours: null, sleepScore: 320 }),
    "dormi mal",
  );

  expect(input).toEqual({
    type: "sleep",
    data: { trackedSleepTime: undefined, score: 100 },
    tags: [],
  });
});

test("builds a weightlifting workout with empty sets", () => {
  const input = toCreateEventInput(
    aRawCommand({
      type: "training",
      workoutKind: "weightlifting",
      workoutDurationMinutes: 50,
      workoutCalories: 300,
    }),
    "treinei peito",
  );

  expect(input).toEqual({
    type: "training",
    data: { workouts: [{ type: "weightlifting", calories: 300, duration: 50, sets: [] }] },
    tags: [],
  });
});

test("builds a running workout with the reported distance", () => {
  const input = toCreateEventInput(
    aRawCommand({
      type: "training",
      workoutKind: "running",
      workoutDurationMinutes: 30,
      workoutDistanceKm: 5,
    }),
    "corri cinco quilometros em trinta minutos",
  );

  expect(input).toEqual({
    type: "training",
    data: {
      workouts: [{ type: "running", calories: 0, duration: 30, distance: 5, pace: 0 }],
    },
    tags: [],
  });
});

test("keeps the workout list empty when the phrase carried no numbers", () => {
  const input = toCreateEventInput(aRawCommand({ type: "training" }), "fui pra academia");

  expect(input).toEqual({ type: "training", data: { workouts: [] }, tags: [] });
});

test("carries the spoken window through to the schedule", () => {
  const schedule = toEventSchedule(
    aRawCommand({ type: "sleep", durationMinutes: 360, endTimeOfDay: "06:00" }),
  );

  expect(schedule).toEqual({
    startTimeOfDay: undefined,
    startOffsetMinutes: undefined,
    durationMinutes: 360,
    endTimeOfDay: "06:00",
  });
});

test("treats empty clock strings as no window at all", () => {
  const schedule = toEventSchedule(aRawCommand({ startTimeOfDay: "  ", endTimeOfDay: "" }));

  expect(schedule).toEqual({
    startTimeOfDay: undefined,
    startOffsetMinutes: undefined,
    durationMinutes: undefined,
    endTimeOfDay: undefined,
  });
});

test("uses the transcript when the model returns no food text", () => {
  const input = toCreateEventInput(
    aRawCommand({ type: "food", foodInputText: "" }),
    "comi uma banana",
  );

  expect(input).toEqual({ type: "food", inputText: "comi uma banana", tags: [] });
});
