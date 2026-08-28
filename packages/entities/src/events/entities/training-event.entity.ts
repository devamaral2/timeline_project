import { Event, type EventProps } from "./event.entity";
import { EventId } from "../value-objects/event-id";
import { TagList } from "../value-objects/tag-list";
import { ulid } from "ulid";

export interface WorkoutSet {
  id?: string;
  exercise: string;
  repetitions: number;
  weight: number;
}

export interface TreadmillWorkout {
  id?: string;
  type: "treadmill";
  calories: number;
  duration: number;
  pace: number;
  distance: number;
}

export interface RunningWorkout {
  id?: string;
  type: "running";
  calories: number;
  duration: number;
  pace: number;
  distance: number;
}

export interface WeightliftingWorkout {
  id?: string;
  type: "weightlifting";
  calories: number;
  duration: number;
  sets: WorkoutSet[];
}

export interface FreeWorkout {
  id?: string;
  type: "free";
  calories: number;
  duration: number;
}

export type Workout = TreadmillWorkout | RunningWorkout | WeightliftingWorkout | FreeWorkout;

export interface TrainingEventData {
  workouts: Workout[];
  caloriesBurned: number;
}

export interface TrainingEventInputData {
  workouts?: Workout[];
  caloriesBurned?: number;
}

type TrainingEventProps = Omit<EventProps<TrainingEventData>, "data"> & {
  data: TrainingEventInputData;
};

export class TrainingEvent extends Event<TrainingEventData> {
  private constructor(props: TrainingEventProps) {
    super(
      props.id ?? EventId.create(),
      "training",
      props.userId,
      props.name,
      props.description,
      props.startedAt,
      props.finishedAt,
      TagList.create(props.tags),
      props.interruptions,
      normalizeTrainingEventData(props.data),
      props.missed,
      props.priority,
    );
  }

  static create(props: TrainingEventProps): TrainingEvent {
    return new TrainingEvent(props);
  }
}

function normalizeTrainingEventData(data: TrainingEventInputData): TrainingEventData {
  const workouts = (data.workouts ?? []).map((workout) => {
    const normalizedWorkout = {
      ...workout,
      id: workout.id ?? ulid(),
    };

    if (normalizedWorkout.type !== "weightlifting") return normalizedWorkout;

    return {
      ...normalizedWorkout,
      sets: normalizedWorkout.sets.map((set) => ({
        ...set,
        id: set.id ?? ulid(),
      })),
    };
  });

  return {
    workouts,
    caloriesBurned:
      data.caloriesBurned ?? workouts.reduce((total, workout) => total + workout.calories, 0),
  };
}
