import { ulid } from "ulid";
import { EventValidationError } from "../errors/event.errors";

export type WorkoutCode = "treadmill" | "running" | "weightlifting" | "free";

const KNOWN_WORKOUT_CODES: readonly WorkoutCode[] = [
  "treadmill",
  "running",
  "weightlifting",
  "free",
];

const CARDIO_WORKOUT_CODES: readonly WorkoutCode[] = ["treadmill", "running"];

export interface WorkoutSet {
  id: string;
  exercise: string;
  repetitions: number;
  weight: number;
}

export interface WorkoutSnapshotBase {
  id: string;
  workoutCode: WorkoutCode;
  workoutName: string;
  calories: number;
  duration: number;
}

export interface CardioWorkoutSnapshot extends WorkoutSnapshotBase {
  workoutCode: "treadmill" | "running";
  pace: number;
  distance: number;
}

export interface WeightliftingWorkoutSnapshot extends WorkoutSnapshotBase {
  workoutCode: "weightlifting";
  sets: WorkoutSet[];
}

export interface FreeWorkoutSnapshot extends WorkoutSnapshotBase {
  workoutCode: "free";
}

export type WorkoutSnapshot =
  | CardioWorkoutSnapshot
  | WeightliftingWorkoutSnapshot
  | FreeWorkoutSnapshot;

export interface TrainingData {
  workouts: WorkoutSnapshot[];
  caloriesBurned: number;
}

// Entrada de criacao/edicao: workoutName e caloriesBurned nao vem do cliente —
// sao preenchidos/recalculados pela API a partir do catalogo fixo de workouts.
export type WorkoutInput =
  | (Omit<CardioWorkoutSnapshot, "id" | "workoutName" | "calories"> & {
      id?: string;
      calories?: number;
    })
  | (Omit<WeightliftingWorkoutSnapshot, "id" | "workoutName" | "calories" | "sets"> & {
      id?: string;
      calories?: number;
      sets: Array<Omit<WorkoutSet, "id"> & { id?: string }>;
    })
  | (Omit<FreeWorkoutSnapshot, "id" | "workoutName" | "calories"> & {
      id?: string;
      calories?: number;
    });

export interface TrainingInputData {
  workouts: WorkoutInput[];
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseWorkoutSnapshot(data: unknown): WorkoutSnapshot {
  if (typeof data !== "object" || data === null) {
    throw new EventValidationError("Workout must be an object");
  }
  const source = data as Record<string, unknown>;

  if (!KNOWN_WORKOUT_CODES.includes(source.workoutCode as WorkoutCode)) {
    throw new EventValidationError("Workout requires a known workoutCode");
  }
  const workoutCode = source.workoutCode as WorkoutCode;

  if (!isNonEmptyString(source.workoutName)) {
    throw new EventValidationError("Workout requires a workoutName");
  }
  if (!isFiniteNonNegative(source.calories)) {
    throw new EventValidationError("Workout requires non-negative calories");
  }
  if (!isFiniteNonNegative(source.duration)) {
    throw new EventValidationError("Workout requires non-negative duration");
  }

  const base = {
    id: isNonEmptyString(source.id) ? source.id : ulid(),
    workoutCode,
    workoutName: source.workoutName,
    calories: source.calories as number,
    duration: source.duration as number,
  };

  if (CARDIO_WORKOUT_CODES.includes(workoutCode)) {
    if (!isFiniteNonNegative(source.pace)) {
      throw new EventValidationError("Cardio workout requires non-negative pace");
    }
    if (!isFiniteNonNegative(source.distance)) {
      throw new EventValidationError("Cardio workout requires non-negative distance");
    }
    return {
      ...base,
      workoutCode,
      pace: source.pace as number,
      distance: source.distance as number,
    } as CardioWorkoutSnapshot;
  }

  if (workoutCode === "weightlifting") {
    if (!Array.isArray(source.sets)) {
      throw new EventValidationError("Weightlifting workout requires an array of sets");
    }
    const sets = source.sets.map((set) => {
      if (typeof set !== "object" || set === null) {
        throw new EventValidationError("Workout set must be an object");
      }
      const setSource = set as Record<string, unknown>;
      if (!isNonEmptyString(setSource.exercise)) {
        throw new EventValidationError("Workout set requires an exercise");
      }
      if (!isFiniteNonNegative(setSource.repetitions)) {
        throw new EventValidationError("Workout set requires non-negative repetitions");
      }
      if (!isFiniteNonNegative(setSource.weight)) {
        throw new EventValidationError("Workout set requires non-negative weight");
      }
      return {
        id: isNonEmptyString(setSource.id) ? setSource.id : ulid(),
        exercise: setSource.exercise,
        repetitions: setSource.repetitions as number,
        weight: setSource.weight as number,
      };
    });
    return { ...base, workoutCode, sets } as WeightliftingWorkoutSnapshot;
  }

  return { ...base, workoutCode: "free" } as FreeWorkoutSnapshot;
}

export function parseTrainingData(data: unknown, schemaVersion: number): TrainingData {
  if (schemaVersion !== 1) {
    throw new EventValidationError("Unsupported schema version");
  }
  if (typeof data !== "object" || data === null) {
    throw new EventValidationError("Training data must be an object");
  }
  const source = data as Record<string, unknown>;

  if (!Array.isArray(source.workouts)) {
    throw new EventValidationError("Training data requires an array of workouts");
  }
  const workouts = source.workouts.map(parseWorkoutSnapshot);

  if (!isFiniteNonNegative(source.caloriesBurned)) {
    throw new EventValidationError("Training data requires non-negative caloriesBurned");
  }
  const expectedCaloriesBurned = workouts.reduce((total, workout) => total + workout.calories, 0);
  if (source.caloriesBurned !== expectedCaloriesBurned) {
    throw new EventValidationError("caloriesBurned does not match the sum of workouts");
  }

  return { workouts, caloriesBurned: source.caloriesBurned };
}
