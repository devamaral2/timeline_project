import { ulid } from "ulid";
import type { Artifact, FoodData } from "../../../../domain";
import type { FoodGenerationPayload } from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { enqueueJobInTransaction } from "../../../jobs/job-context";
import { appendEntry, insertAgentEvent } from "../../requests/request-rows";
import type { Tx } from "../../shared/tx";

export const FOOD_GENERATION_JOB = "food-generation";

/**
 * Um alimento que nasce a espera dos nutrientes abre um pedido de construcao:
 * o pedido altera o alimento, e um job o executa. Tudo na transacao que grava o
 * alimento, para que nenhum fique pendente sem ninguem calculando.
 */
export async function startFoodGeneration(tx: Tx, artifact: Artifact): Promise<void> {
  const food = artifact.data as FoodData;
  if (artifact.type !== "food" || food.generation?.status !== "pending" || !artifact.userId) return;

  const requestId = ulid();
  await insertAgentEvent(tx, {
    id: requestId,
    userId: artifact.userId,
    kind: "build_request",
    status: "queued",
    name: `Calcular os nutrientes de ${artifact.name}`,
    data: { route: "food" },
  });
  await tx.insert(schema.eventArtifactRelation).values({
    eventId: requestId,
    artifactId: artifact.id,
    relation: "updates",
  });
  await appendEntry(tx, {
    eventId: requestId,
    userId: artifact.userId,
    kind: "message",
    role: "user",
    content: food.description,
  });
  await enqueueJobInTransaction(tx, {
    kind: FOOD_GENERATION_JOB,
    userId: artifact.userId,
    actorId: artifact.userId,
    eventId: requestId,
    dedupeKey: artifact.id,
    payload: {
      artifactId: artifact.id,
      userId: artifact.userId,
      expectedRevision: artifact.revision,
      description: food.description,
      name: artifact.name,
    } satisfies FoodGenerationPayload,
  });
}
