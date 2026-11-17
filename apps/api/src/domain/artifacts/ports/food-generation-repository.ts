import type { Artifact } from "../entities/artifact.entity";
import type { FoodData } from "../types/food-data";

/** O que o usuario escreveu, guardado quando o alimento foi inserido. Nunca lido de outro alimento. */
export interface FoodGenerationPayload {
  artifactId: string;
  userId: string;
  expectedRevision: number;
  description: string;
  name: string;
}

export type FoodGenerationOutcome = "completed" | "skipped" | "failed";

export interface FoodGenerationRepository {
  findById(artifactId: string): Promise<Artifact | null>;
  /**
   * Grava os nutrientes calculados se o alimento ainda esta na revisao em que
   * a geracao foi pedida; `data` nulo so registra que a geracao foi pulada.
   * A escrita e o encerramento do pedido de construcao acontecem na mesma
   * transacao. Devolve se o alimento foi alterado.
   */
  finishFoodGeneration(
    payload: FoodGenerationPayload,
    data: FoodData | null,
    outcome: FoodGenerationOutcome,
  ): Promise<boolean>;
}
