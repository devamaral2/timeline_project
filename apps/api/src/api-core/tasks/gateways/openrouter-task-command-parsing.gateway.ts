import { getServerEnv } from "../../../config/env";
import { LlmHttpError } from "../../agent/errors/agent.errors";
import type {
  TaskCommandParsingGateway,
  ParsedTaskCommand,
} from "./task-command-parsing.gateway";
import type { CreateTaskInput } from "@repo/contracts";
import { TaskCommandPromptBuilderService } from "../services/task-command-prompt-builder.service";
import type { ParsedTaskSchedule } from "../services/task-schedule.service";
import type { WorkoutInput } from "../../../domain/index";

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ROUTINE_NAME_LENGTH = 60;
const MAX_SLEEP_HOURS = 24;
const MAX_SLEEP_SCORE = 100;

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface RawTaskCommand {
  type: string;
  routineName: string;
  foodInputText: string;
  sleepHours: number | null;
  sleepScore: number | null;
  workoutKind: string;
  workoutDurationMinutes: number | null;
  workoutCalories: number | null;
  workoutDistanceKm: number | null;
  startTimeOfDay: string;
  startOffsetMinutes: number | null;
  durationMinutes: number | null;
  endTimeOfDay: string;
  placeName: string;
}

const taskCommandSchema = {
  name: "task_command",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "type",
      "routineName",
      "foodInputText",
      "sleepHours",
      "sleepScore",
      "workoutKind",
      "workoutDurationMinutes",
      "workoutCalories",
      "workoutDistanceKm",
      "startTimeOfDay",
      "startOffsetMinutes",
      "durationMinutes",
      "endTimeOfDay",
      "placeName",
    ],
    properties: {
      type: { type: "string", enum: ["common", "food", "training", "sleep"] },
      routineName: { type: "string" },
      foodInputText: { type: "string" },
      sleepHours: { type: ["number", "null"] },
      sleepScore: { type: ["number", "null"] },
      workoutKind: {
        type: "string",
        enum: ["walking", "treadmill", "running", "weightlifting", "free"],
      },
      workoutDurationMinutes: { type: ["number", "null"] },
      workoutCalories: { type: ["number", "null"] },
      workoutDistanceKm: { type: ["number", "null"] },
      startTimeOfDay: { type: "string" },
      startOffsetMinutes: { type: ["number", "null"] },
      durationMinutes: { type: ["number", "null"] },
      endTimeOfDay: { type: "string" },
      placeName: { type: "string" },
    },
  },
} as const;

export class OpenRouterTaskCommandParsingGateway implements TaskCommandParsingGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_MODEL,
    private readonly promptBuilder: TaskCommandPromptBuilderService = new TaskCommandPromptBuilderService(),
  ) {}

  async parseCommand(input: { text: string }): Promise<ParsedTaskCommand> {
    console.log("[OpenRouterTaskCommandParsingGateway] parseCommand called", {
      hasApiKey: Boolean(this.apiKey),
      modelName: this.modelName,
      transcriptLength: input.text.length,
    });

    if (!this.apiKey) {
      console.error("[OpenRouterTaskCommandParsingGateway] OPENROUTER_API_KEY is missing");
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    if (!this.modelName) {
      console.error("[OpenRouterTaskCommandParsingGateway] OPENROUTER_MODEL is missing");
      throw new Error("Missing OPENROUTER_MODEL");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [{ role: "user", content: this.promptBuilder.build(input.text) }],
        response_format: {
          type: "json_schema",
          json_schema: taskCommandSchema,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "<failed to read body>");
      console.error("[OpenRouterTaskCommandParsingGateway] OpenRouter request failed", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new LlmHttpError(response.status);
    }

    const payload = (await response.json()) as OpenRouterResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      console.error("[OpenRouterTaskCommandParsingGateway] response did not include command JSON", {
        payload,
      });
      throw new Error("OpenRouter response did not include command JSON");
    }

    let raw: Partial<RawTaskCommand>;
    try {
      raw = JSON.parse(content) as Partial<RawTaskCommand>;
    } catch (parseError) {
      console.error("[OpenRouterTaskCommandParsingGateway] failed to JSON.parse content", {
        content,
        parseError,
      });
      throw parseError;
    }

    const parsedInput = toCreateTaskInput(raw, input.text);
    const schedule = toTaskSchedule(raw);
    console.log("[OpenRouterTaskCommandParsingGateway] parseCommand succeeded", {
      kind: parsedInput.kind,
      schedule,
    });

    const place = raw.placeName?.trim();
    return {
      input: parsedInput,
      schedule,
      ...(place ? { place } : {}),
      modelProvider: "openrouter",
      modelName: this.modelName,
    };
  }
}

/**
 * Traduz a resposta plana do modelo para o `CreateTaskInput` do dominio.
 * Nunca lanca: uma classificacao errada vira uma tarefa de rotina que o usuario edita depois.
 */
export function toCreateTaskInput(
  raw: Partial<RawTaskCommand>,
  transcript: string,
): CreateTaskInput {
  const fallbackName = transcript.trim().slice(0, MAX_ROUTINE_NAME_LENGTH);

  switch (raw.type) {
    case "food":
      return {
        kind: "meal",
        artifacts: [{ type: "food", data: { inputText: raw.foodInputText?.trim() || transcript.trim() } }],
        tags: [],
      };
    case "sleep":
      return {
        kind: "sleep",
        artifacts: [
          {
            type: "sleep",
            data: {
              trackedSleepTime: normalizeSleepMinutes(raw.sleepHours),
              score: clamp(raw.sleepScore, 0, MAX_SLEEP_SCORE),
            },
          },
        ],
        tags: [],
      };
    case "training":
      return {
        kind: "training",
        artifacts: [{ type: "training", data: { workouts: toWorkouts(raw) } }],
        tags: [],
      };
    default:
      return {
        name: raw.routineName?.trim() || fallbackName,
        kind: "common",
        tags: [],
      };
  }
}

/**
 * Extrai a janela da tarefa. Os limites e a virada de dia ficam com `resolveTaskSchedule`:
 * aqui so passamos adiante o que o modelo disse.
 */
export function toTaskSchedule(raw: Partial<RawTaskCommand>): ParsedTaskSchedule {
  return {
    startTimeOfDay: raw.startTimeOfDay?.trim() || undefined,
    startOffsetMinutes: raw.startOffsetMinutes ?? undefined,
    durationMinutes: raw.durationMinutes ?? undefined,
    endTimeOfDay: raw.endTimeOfDay?.trim() || undefined,
  };
}

/**
 * O artefato de sono guarda trackedSleepTime em MINUTOS. Modelos as vezes respondem
 * ja em minutos apesar da instrucao pedir horas decimais, entao qualquer valor
 * acima de 24 e tratado como minutos antes da conversao final.
 */
function normalizeSleepMinutes(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const hours = value > MAX_SLEEP_HOURS ? value / 60 : value;
  const clampedHours = clamp(hours, 0, MAX_SLEEP_HOURS) ?? 0;
  return Math.round(clampedHours * 60);
}

function clamp(value: number | null | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(value, min), max);
}

function toWorkouts(raw: Partial<RawTaskCommand>): WorkoutInput[] {
  const duration = clamp(raw.workoutDurationMinutes, 0, Number.MAX_SAFE_INTEGER);
  const calories = clamp(raw.workoutCalories, 0, Number.MAX_SAFE_INTEGER);
  const distance = clamp(raw.workoutDistanceKm, 0, Number.MAX_SAFE_INTEGER);

  if (duration === undefined && calories === undefined && distance === undefined) return [];

  const base = { calories: calories ?? 0, duration: duration ?? 0 };
  switch (raw.workoutKind) {
    case "weightlifting":
      return [{ workoutCode: "weightlifting", ...base, sets: [] }];
    case "walking":
    case "running":
    case "treadmill":
      return [{ workoutCode: raw.workoutKind, ...base, distance: distance ?? 0, pace: 0 }];
    default:
      return [{ workoutCode: "free", ...base }];
  }
}
