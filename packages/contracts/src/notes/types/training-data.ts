export type WorkoutCode = "treadmill" | "running" | "weightlifting" | "free";

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
