import type { FoodData } from "./types/food-data";
import type { SleepData } from "./types/sleep-data";
import type { TextData } from "./types/text-data";
import type { TrainingData, TrainingInputData } from "./types/training-data";

/** O alimento entra como texto livre; quem calcula os nutrientes e um pedido de construcao ao agente. */
export interface FoodCreateInput {
  inputText: string;
}

interface ArtifactInputBase {
  name?: string;
  tags?: string[];
}

/** Os tipos de texto livre que precisam ser ditos na criacao: sem `type`, o artefato nasce nota (`text`). */
type NamedFreeTextType = "news" | "email_summary" | "youtube_transcript";

/**
 * Um artefato novo. `type` ausente e texto livre. O alimento entra como texto
 * (`inputText`) e passa pelo agente; o treino resolve os nomes pelos exercicios
 * globais.
 */
export type CreateArtifactInput =
  | (ArtifactInputBase & { type?: "text"; data: TextData })
  | (ArtifactInputBase & { type: NamedFreeTextType; data: TextData })
  | (ArtifactInputBase & { type: "food"; data: FoodCreateInput })
  | (ArtifactInputBase & { type: "sleep"; data?: Partial<SleepData> })
  | (ArtifactInputBase & { type: "training"; data?: TrainingInputData });

/** O conteudo inteiro de um artefato, ao editar. */
export type ArtifactDataInput =
  | { type: "text"; data: TextData }
  | { type: NamedFreeTextType; data: TextData }
  | { type: "food"; data: FoodData }
  | { type: "sleep"; data: SleepData }
  | { type: "training"; data: TrainingData };

/**
 * `POST /api/artifacts`: o artefato e as tarefas em que ele ja nasce
 * aparecendo. Quem registra o artefato e a tarefa, entao aparecer numa tarefa
 * conta como edita-lo.
 */
export type CreateArtifactRequest = CreateArtifactInput & {
  taskIds?: string[];
};

interface UpdateArtifactBase {
  artifactId: string;
  expectedRevision: number;
  name?: string;
  tags?: string[];
  /**
   * As tarefas em que o artefato aparece, a lista completa: quem sai da lista
   * perde a relacao (o artefato continua existindo), quem entra o recebe no
   * fim. Ausente, as relacoes ficam como estao.
   */
  taskIds?: string[];
}

/** `PATCH /api/artifacts/:artifactId`. Com `type`, o `data` e o novo conteudo inteiro. */
export type UpdateArtifactRequest = UpdateArtifactBase &
  ({ type?: undefined; data?: undefined } | (ArtifactDataInput & { schemaVersion?: number }));
