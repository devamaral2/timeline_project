import type { RoutineData } from "../items/routine-data";
import type { MealItem } from "../items/meal-item";
import type { SleepItem } from "../items/sleep-item";
import type { TrainingData, TrainingInputData } from "../items/training-data";

export type KnownEventItemType = "routine" | "meal" | "sleep" | "training";

export interface EventItemDtoOf<TType extends KnownEventItemType, TData> {
  id: string;
  position: number;
  type: TType;
  schemaVersion: number;
  isPrimary: boolean;
  data: TData;
}

export type EventItemDto =
  | EventItemDtoOf<"routine", RoutineData>
  | EventItemDtoOf<"meal", MealItem>
  | EventItemDtoOf<"sleep", SleepItem>
  | EventItemDtoOf<"training", TrainingData>;

export interface MealCreateInput {
  inputText: string;
}

export type CreateEventItemInput =
  | { type: "routine"; isPrimary?: boolean; data?: Record<string, never> }
  | { type: "meal"; isPrimary?: boolean; data: MealCreateInput }
  | { type: "sleep"; isPrimary?: boolean; data?: Partial<SleepItem> }
  | { type: "training"; isPrimary?: boolean; data?: TrainingInputData };

export type UpdateEventItemInput =
  | { id?: string; type: "routine"; schemaVersion: number; isPrimary: boolean; data: RoutineData }
  | { id?: string; type: "meal"; schemaVersion: number; isPrimary: boolean; data: MealItem }
  | { id?: string; type: "sleep"; schemaVersion: number; isPrimary: boolean; data: SleepItem }
  | { id?: string; type: "training"; schemaVersion: number; isPrimary: boolean; data: TrainingData };
