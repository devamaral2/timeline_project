import { EventValidationError } from "../errors/event.errors";
import type { EventItemDefinition } from "./event-item-definition";
import { parseRoutineData } from "./routine-data";
import { parseMealItem } from "./meal-item";
import { parseSleepItem } from "./sleep-item";
import { parseTrainingData } from "./training-data";

export interface ParsedEventItemData {
  schemaVersion: number;
  data: unknown;
}

export class EventItemRegistry {
  private readonly definitions: Map<string, EventItemDefinition<unknown>>;

  constructor(definitions: readonly EventItemDefinition<unknown>[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.type, definition]));
  }

  getDefinition(type: string): EventItemDefinition<unknown> | undefined {
    return this.definitions.get(type);
  }

  parse(type: string, data: unknown, schemaVersion: number): ParsedEventItemData {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new EventValidationError(`Unknown event item type: ${type}`);
    }
    const parsed = definition.parse(data, schemaVersion);
    return { schemaVersion: definition.currentSchemaVersion, data: parsed };
  }
}

const MEAL_SLEEP_TRAINING = ["meal", "sleep", "training"] as const;

export const defaultEventItemRegistry = new EventItemRegistry([
  {
    type: "routine",
    currentSchemaVersion: 1,
    incompatibleWith: [],
    parse: parseRoutineData,
  },
  {
    type: "meal",
    currentSchemaVersion: 1,
    incompatibleWith: MEAL_SLEEP_TRAINING,
    parse: parseMealItem,
  },
  {
    type: "sleep",
    currentSchemaVersion: 1,
    incompatibleWith: MEAL_SLEEP_TRAINING,
    parse: parseSleepItem,
  },
  {
    type: "training",
    currentSchemaVersion: 1,
    incompatibleWith: MEAL_SLEEP_TRAINING,
    parse: parseTrainingData,
  },
]);
