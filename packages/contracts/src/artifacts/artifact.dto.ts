import type { EventActor, EventArtifactRelation, EventKind } from "../events/event-types";
import type { AgentFileData } from "./types/agent-file-data";
import type { FoodData } from "./types/food-data";
import type { SleepData } from "./types/sleep-data";
import type { TextData } from "./types/text-data";
import type { TrainingData } from "./types/training-data";
import type { WorkoutData } from "./types/workout-data";

export type ArtifactType = "text" | "food" | "sleep" | "training" | "workout" | "skill" | "agent" | "router";

/** Um evento em que o artefato aparece, com o necessario para listar. */
export interface ArtifactEventLinkDto {
  eventId: string;
  relation: EventArtifactRelation;
  name: string;
  actor: EventActor;
  kind: EventKind;
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
  /** Copia de outro artefato, feita para um evento. Nao aparece nas listas. */
  derived: boolean;
  /** Preenchido pela API de artefatos (vazio no artefato solto); ausente nos artefatos que um evento devolve. */
  events?: ArtifactEventLinkDto[];
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
