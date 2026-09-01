import { getServerEnv } from "../../config/env";
import type {
  EventCommandParsingGateway,
  ParsedEventCommand,
} from "./event-command-parsing.gateway";
import type { CreateEventInput } from "@repo/entities/contracts";
import { EventCommandPromptBuilderService } from "../services/event-command-prompt-builder.service";
import type { ParsedEventSchedule } from "../services/event-schedule.service";
import type { WorkoutInput } from "@repo/entities";

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

export interface RawEventCommand {
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
}

const eventCommandSchema = {
  name: "event_command",
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
    ],
    properties: {
      type: { type: "string", enum: ["routine", "food", "training", "sleep"] },
      routineName: { type: "string" },
      foodInputText: { type: "string" },
      sleepHours: { type: ["number", "null"] },
      sleepScore: { type: ["number", "null"] },
      workoutKind: {
        type: "string",
        enum: ["treadmill", "running", "weightlifting", "free"],
      },
      workoutDurationMinutes: { type: ["number", "null"] },
      workoutCalories: { type: ["number", "null"] },
      workoutDistanceKm: { type: ["number", "null"] },
      startTimeOfDay: { type: "string" },
      startOffsetMinutes: { type: ["number", "null"] },
      durationMinutes: { type: ["number", "null"] },
      endTimeOfDay: { type: "string" },
    },
  },
} as const;

export class OpenRouterEventCommandParsingGateway implements EventCommandParsingGateway {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().OPENROUTER_API_KEY,
    private readonly modelName: string | undefined = getServerEnv().OPENROUTER_MODEL,
    private readonly promptBuilder: EventCommandPromptBuilderService = new EventCommandPromptBuilderService(),
  ) {}

  async parseCommand(input: { text: string }): Promise<ParsedEventCommand> {
    console.log("[OpenRouterEventCommandParsingGateway] parseCommand called", {
      hasApiKey: Boolean(this.apiKey),
      modelName: this.modelName,
      transcriptLength: input.text.length,
    });

    if (!this.apiKey) {
      console.error("[OpenRouterEventCommandParsingGateway] OPENROUTER_API_KEY is missing");
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    if (!this.modelName) {
      console.error("[OpenRouterEventCommandParsingGateway] OPENROUTER_MODEL is missing");
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
          json_schema: eventCommandSchema,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "<failed to read body>");
      console.error("[OpenRouterEventCommandParsingGateway] OpenRouter request failed", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenRouterResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      console.error("[OpenRouterEventCommandParsingGateway] response did not include command JSON", {
        payload,
      });
      throw new Error("OpenRouter response did not include command JSON");
    }

    let raw: Partial<RawEventCommand>;
    try {
      raw = JSON.parse(content) as Partial<RawEventCommand>;
    } catch (parseError) {
      console.error("[OpenRouterEventCommandParsingGateway] failed to JSON.parse content", {
        content,
        parseError,
      });
      throw parseError;
    }

    const parsedInput = toCreateEventInput(raw, input.text);
    const schedule = toEventSchedule(raw);
    console.log("[OpenRouterEventCommandParsingGateway] parseCommand succeeded", {
      itemType: parsedInput.items[0]?.type,
      schedule,
    });

    return {
      input: parsedInput,
      schedule,
      modelProvider: "openrouter",
      modelName: this.modelName,
    };
  }
}

/**
 * Traduz a resposta plana do modelo para o `CreateEventInput` do dominio.
 * Nunca lanca: uma classificacao errada vira um evento de rotina que o usuario edita depois.
 */
export function toCreateEventInput(
  raw: Partial<RawEventCommand>,
  transcript: string,
): CreateEventInput {
  const fallbackName = transcript.trim().slice(0, MAX_ROUTINE_NAME_LENGTH);

  switch (raw.type) {
    case "food":
      return {
        items: [{ type: "meal", data: { inputText: raw.foodInputText?.trim() || transcript.trim() } }],
        tags: [],
      };
    case "sleep":
      return {
        items: [
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
        items: [{ type: "training", data: { workouts: toWorkouts(raw) } }],
        tags: [],
      };
    default:
      return {
        name: raw.routineName?.trim() || fallbackName,
        items: [{ type: "routine" }],
        tags: [],
      };
  }
}

/**
 * Extrai a janela do evento. Os limites e a virada de dia ficam com `resolveEventSchedule`:
 * aqui so passamos adiante o que o modelo disse.
 */
export function toEventSchedule(raw: Partial<RawEventCommand>): ParsedEventSchedule {
  return {
    startTimeOfDay: raw.startTimeOfDay?.trim() || undefined,
    startOffsetMinutes: raw.startOffsetMinutes ?? undefined,
    durationMinutes: raw.durationMinutes ?? undefined,
    endTimeOfDay: raw.endTimeOfDay?.trim() || undefined,
  };
}

/**
 * O item de sono guarda trackedSleepTime em MINUTOS. Modelos as vezes respondem
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

function toWorkouts(raw: Partial<RawEventCommand>): WorkoutInput[] {
  const duration = clamp(raw.workoutDurationMinutes, 0, Number.MAX_SAFE_INTEGER);
  const calories = clamp(raw.workoutCalories, 0, Number.MAX_SAFE_INTEGER);
  const distance = clamp(raw.workoutDistanceKm, 0, Number.MAX_SAFE_INTEGER);

  if (duration === undefined && calories === undefined && distance === undefined) return [];

  const base = { calories: calories ?? 0, duration: duration ?? 0 };
  switch (raw.workoutKind) {
    case "weightlifting":
      return [{ workoutCode: "weightlifting", ...base, sets: [] }];
    case "running":
    case "treadmill":
      return [{ workoutCode: raw.workoutKind, ...base, distance: distance ?? 0, pace: 0 }];
    default:
      return [{ workoutCode: "free", ...base }];
  }
}
