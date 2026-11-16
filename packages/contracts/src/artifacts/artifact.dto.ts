import type { TaskActor, TaskArtifactRelation, TaskKind } from "../tasks/task-types";
import type { AgentFileData } from "./types/agent-file-data";
import type { FoodData } from "./types/food-data";
import type { SleepData } from "./types/sleep-data";
import type { TextData } from "./types/text-data";
import type { TrainingData } from "./types/training-data";
import type { WorkoutData } from "./types/workout-data";

export type ArtifactType = "text" | "food" | "sleep" | "training" | "workout" | "skill" | "agent" | "router";

/** Uma tarefa em que o artefato aparece, com o necessario para listar. */
export interface ArtifactTaskLinkDto {
  taskId: string;
  relation: TaskArtifactRelation;
  name: string;
  actor: TaskActor;
  kind: TaskKind;
  startedAt?: string;
  estimatedFinishAt?: string;
}

export interface ArtifactDtoOf<TType extends ArtifactType, TData> {
  id: string;
  name: string;
  type: TType;
  schemaVersion: number;
  data: TData;
  /** Artefato global: sem dono, todos leem e ninguem edita pelo app. */
  global: boolean;
  /** Copia de outro artefato, feita para uma tarefa. Nao aparece nas listas. */
  derived: boolean;
  /** Preenchido pela API de artefatos (vazio no artefato solto); ausente nos artefatos que uma tarefa devolve. */
  tasks?: ArtifactTaskLinkDto[];
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** Um artefato: `type` + `schemaVersion` dizem que forma o `data` tem. */
export type ArtifactDto =
  | ArtifactDtoOf<"text", TextData>
  | ArtifactDtoOf<"food", FoodData>
  | ArtifactDtoOf<"sleep", SleepData>
  | ArtifactDtoOf<"training", TrainingData>
  | ArtifactDtoOf<"workout", WorkoutData>
  | ArtifactDtoOf<"skill", AgentFileData>
  | ArtifactDtoOf<"agent", AgentFileData>
  | ArtifactDtoOf<"router", TextData>;
