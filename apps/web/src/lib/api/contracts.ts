/**
 * Contratos HTTP consumidos pelo web.
 *
 * Estes tipos descrevem o wire format que o frontend conhece hoje. Eles ficam
 * deliberadamente fora do package de dominio: o backend pode evoluir seu dominio
 * sem transformar o package de entidades em dependencia do navegador.
 */

export const eventPriorities = ["urgent", "normal", "flexible"] as const;
export type EventPriority = (typeof eventPriorities)[number];

export type KnownEventItemType = "routine" | "meal" | "sleep" | "training";
export type RoutineData = Record<string, never>;

export interface FoodItemMacronutrients {
  carbohydratesGrams: number;
  proteinsGrams: number;
  totalFatGrams: number;
  fiberGrams: number;
}

export interface FoodItem {
  id: string;
  sourceFoodId?: string;
  sourceFoodRevision?: number;
  name: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: FoodItemMacronutrients;
  micronutrients: Record<string, number>;
}

export interface MealTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
}

export interface MealItem {
  sourceMealId?: string;
  sourceMealRevision?: number;
  name: string;
  description: string;
  foodItems: FoodItem[];
  totals: MealTotals;
}

export interface SleepItem {
  trackedSleepTime: number;
  score: number;
}

export type WorkoutCode = "treadmill" | "running" | "weightlifting" | "free";

export interface WorkoutSet {
  id: string;
  exercise: string;
  repetitions: number;
  weight: number;
}

interface WorkoutSnapshotBase {
  id: string;
  workoutCode: WorkoutCode;
  workoutName: string;
  calories: number;
  duration: number;
}

export type WorkoutSnapshot =
  | (WorkoutSnapshotBase & { workoutCode: "treadmill" | "running"; pace: number; distance: number })
  | (WorkoutSnapshotBase & { workoutCode: "weightlifting"; sets: WorkoutSet[] })
  | (WorkoutSnapshotBase & { workoutCode: "free" });

export interface TrainingData {
  workouts: WorkoutSnapshot[];
  caloriesBurned: number;
}

export type WorkoutInput =
  | (Omit<Extract<WorkoutSnapshot, { workoutCode: "treadmill" | "running" }>, "id" | "workoutName" | "calories"> & {
      id?: string;
      calories?: number;
    })
  | (Omit<Extract<WorkoutSnapshot, { workoutCode: "weightlifting" }>, "id" | "workoutName" | "calories" | "sets"> & {
      id?: string;
      calories?: number;
      sets: Array<Omit<WorkoutSet, "id"> & { id?: string }>;
    })
  | (Omit<Extract<WorkoutSnapshot, { workoutCode: "free" }>, "id" | "workoutName" | "calories"> & {
      id?: string;
      calories?: number;
    });

export interface TrainingInputData {
  workouts: WorkoutInput[];
}

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

export interface CreateEventInput {
  name?: string;
  description?: string;
  tags?: string[];
  missed?: boolean;
  priority?: EventPriority;
  /** ISO-8601. Ausente e agora; pode ser passado ou futuro. */
  startedAt?: string;
  /** ISO-8601. Ausente e um evento sem fim declarado. */
  finishedAt?: string;
  items: CreateEventItemInput[];
  taskIds?: string[];
}

export const recurrenceFrequencies = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

/** A regra de repeticao de `POST /api/recurrences`. */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  /** Mascara de dias da semana, bit 0 = domingo. So em `weekly`. */
  byWeekday?: number;
  /** So em `monthly` e `yearly`. */
  byMonthDay?: number;
  /** So em `yearly`. */
  byMonth?: number;
  /** `HH:MM`, hora de parede no fuso da regra. */
  timeOfDay: string;
  durationMinutes?: number;
  timeZone: string;
  /** `YYYY-MM-DD`. */
  startsOn: string;
  endsOn?: string;
}

export type CreateEventRecurrenceInput = RecurrenceRule & {
  target: "event";
  template: Omit<CreateEventInput, "startedAt" | "finishedAt">;
};

export interface InterruptionPatchInput {
  id?: string;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface UpdateEventInput {
  eventId: string;
  expectedRevision: number;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
  tags?: string[];
  missed?: boolean;
  priority?: EventPriority;
  interruptions?: InterruptionPatchInput[];
  items?: UpdateEventItemInput[];
  taskIds?: string[];
}

export interface TimelineEventCardDto {
  id: string;
  primaryItemId: string;
  primaryItemType: string;
  itemTypes: string[];
  missed: boolean;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  durationLabel: string;
  tags: string[];
  interruptions: Array<{
    name: string;
    description: string;
    durationLabel: string;
  }>;
}

export interface TimelineEventPageDto {
  items: TimelineEventCardDto[];
  nextCursor?: string;
}

export interface EventDetailInterruptionDto {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt: string;
}

export interface EventDetailDto {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  missed: boolean;
  priority: EventPriority;
  interruptions: EventDetailInterruptionDto[];
  revision: number;
  primaryItemId: string;
  items: EventItemDto[];
  taskIds?: string[];
}

export interface TagSuggestionDto {
  id: string;
  name: string;
}
