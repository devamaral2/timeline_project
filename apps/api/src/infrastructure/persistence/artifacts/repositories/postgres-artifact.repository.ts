import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  Artifact,
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactRevisionConflictError,
  type ArtifactWrites,
  type FoodData,
} from "../../../../domain";
import type {
  ArtifactRepository,
  FoodGenerationOutcome,
  FoodGenerationPayload,
  FoodGenerationRepository,
} from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { completeCurrentJob } from "../../../jobs/job-context";
import { appendEntry } from "../../requests/request-rows";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import type { Db, Tx } from "../../shared/tx";
import { upsertTagIds } from "../../shared/upsert-tag-ids";
import { mapArtifactRow, type ArtifactRow } from "../mappers/artifact-row.mapper";
import { startFoodGeneration } from "./food-generation";

export async function insertArtifact(tx: Tx, artifact: Artifact): Promise<void> {
  await tx.insert(schema.artifacts).values({
    id: artifact.id,
    revision: artifact.revision,
    userId: artifact.userId ?? null,
    name: artifact.name,
    type: artifact.type as ArtifactRow["type"],
    schemaVersion: artifact.schemaVersion,
    data: artifact.data,
    derived: artifact.derived,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  });
  await insertArtifactTags(tx, artifact);
  await startFoodGeneration(tx, artifact);
}

async function insertArtifactTags(tx: Tx, artifact: Artifact): Promise<void> {
  if (artifact.tags.length === 0 || !artifact.userId) return;

  const tagIds = await upsertTagIds(tx, artifact.userId, artifact.tags);
  await tx.insert(schema.artifactTags).values(tagIds.map((tagId) => ({ artifactId: artifact.id, tagId })));
}

/** Artefato apagado conta como inexistente; artefato global nao e de ninguem, entao ninguem o edita. */
export async function updateArtifactAggregate(
  tx: Tx,
  artifact: Artifact,
  actorUserId: string,
  expectedRevision: number,
): Promise<void> {
  const result = await tx.execute(sql`
    UPDATE artifacts
    SET name = ${artifact.name},
        type = ${artifact.type},
        schema_version = ${artifact.schemaVersion},
        data = ${JSON.stringify(artifact.data)}::jsonb,
        revision = ${artifact.revision},
        updated_at = now()
    WHERE id = ${artifact.id}
      AND user_id = ${actorUserId}
      AND revision = ${expectedRevision}
      AND deleted_at IS NULL
    RETURNING revision
  `);

  if (result.rows.length > 0) {
    await tx.delete(schema.artifactTags).where(eq(schema.artifactTags.artifactId, artifact.id));
    await insertArtifactTags(tx, artifact);
    return;
  }

  const [existing] = await tx
    .select({ userId: schema.artifacts.userId, revision: schema.artifacts.revision })
    .from(schema.artifacts)
    .where(and(eq(schema.artifacts.id, artifact.id), isNull(schema.artifacts.deletedAt)));

  classifyUpdateFailure(existing ? { userId: existing.userId ?? "", revision: existing.revision } : undefined, actorUserId, expectedRevision, {
    notFound: () => new ArtifactNotFoundError(`Artifact not found: ${artifact.id}`),
    ownership: () => new ArtifactOwnershipError(),
    conflict: (message) => new ArtifactRevisionConflictError(message),
  });
}

/**
 * Grava os artefatos que viajam com um evento ou uma serie. Vem antes das
 * relacoes, na mesma transacao: uma relacao aponta para um artefato que ja existe.
 */
export async function writeArtifacts(tx: Tx, writes: ArtifactWrites | undefined): Promise<void> {
  for (const artifact of writes?.created ?? []) {
    await insertArtifact(tx, artifact);
  }
  for (const { artifact, expectedRevision } of writes?.updated ?? []) {
    await updateArtifactAggregate(tx, artifact, artifact.userId ?? "", expectedRevision);
  }
  await insertDerivations(tx, writes?.derivations ?? []);
}

/** De qual original saiu cada copia. Nao conta como edicao de nenhum dos dois. */
export async function insertDerivations(
  tx: Tx,
  derivations: readonly { originalId: string; copyId: string }[],
): Promise<void> {
  if (derivations.length === 0) return;
  await tx.insert(schema.artifactArtifactRelation).values(
    derivations.map(({ originalId, copyId }) => ({
      fromArtifactId: originalId,
      toArtifactId: copyId,
      relation: "derives" as const,
    })),
  );
}

/**
 * Soft delete: as relacoes ficam e a leitura filtra `deleted_at IS NULL`.
 * Apagar um evento nao apaga os artefatos dele; so solta a relacao.
 */
export async function softDeleteArtifact(tx: Tx, artifactId: string, actorUserId: string): Promise<void> {
  const [existing] = await tx
    .select({ userId: schema.artifacts.userId })
    .from(schema.artifacts)
    .where(and(eq(schema.artifacts.id, artifactId), isNull(schema.artifacts.deletedAt)));

  if (!existing) throw new ArtifactNotFoundError(`Artifact not found: ${artifactId}`);
  if (existing.userId !== actorUserId) throw new ArtifactOwnershipError();

  await tx
    .update(schema.artifacts)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(schema.artifacts.id, artifactId));
}

export class PostgresArtifactRepository implements ArtifactRepository, FoodGenerationRepository {
  constructor(private readonly db: Db) {}

  async finishFoodGeneration(
    payload: FoodGenerationPayload,
    data: FoodData | null,
    outcome: FoodGenerationOutcome,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      let applied = false;
      if (data) {
        const updated = await tx.execute(sql`
          UPDATE artifacts
          SET data = ${JSON.stringify(data)}::jsonb,
              revision = revision + 1,
              updated_at = now()
          WHERE id = ${payload.artifactId}
            AND user_id = ${payload.userId}
            AND revision = ${payload.expectedRevision}
            AND type = 'food'
            AND deleted_at IS NULL
            AND data->'generation'->>'status' = 'pending'
            AND data->>'description' = ${payload.description}
            AND name = ${payload.name}
          RETURNING id
        `);
        applied = updated.rows.length > 0;
      }
      const final = applied ? outcome : "skipped";

      // O pedido de construcao que altera este alimento termina junto com a escrita.
      const requests = await tx.execute<{ id: string }>(sql`
        UPDATE tasks e
        SET status = ${final === "failed" ? "failed" : "done"}, finished_at = now(), updated_at = now()
        FROM task_artifact_relation r
        WHERE r.artifact_id = ${payload.artifactId} AND r.task_id = e.id
          AND e.actor = 'agent' AND e.kind = 'build_request' AND e.status IN ('queued', 'running')
          AND e.data->>'route' = 'food'
        RETURNING e.id
      `);
      for (const request of requests.rows) {
        await appendEntry(tx, {
          taskId: request.id,
          userId: payload.userId,
          kind: "result",
          data: { outcome: final, artifactId: payload.artifactId },
        });
      }
      await completeCurrentJob(tx);
      return applied;
    });
  }

  async save(artifact: Artifact): Promise<void> {
    await this.db.transaction(async (tx) => {
      await insertArtifact(tx, artifact);
    });
  }

  async update(artifact: Artifact, actorUserId: string, expectedRevision: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await updateArtifactAggregate(tx, artifact, actorUserId, expectedRevision);
    });
  }

  async delete(artifactId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await softDeleteArtifact(tx, artifactId, actorUserId);
    });
  }

  async findById(artifactId: string): Promise<Artifact | null> {
    const [artifact] = await this.findByIds([artifactId]);
    return artifact ?? null;
  }

  async findByIds(artifactIds: readonly string[]): Promise<Artifact[]> {
    if (artifactIds.length === 0) return [];

    const rows = await this.db
      .select()
      .from(schema.artifacts)
      .where(and(inArray(schema.artifacts.id, [...artifactIds]), isNull(schema.artifacts.deletedAt)));
    return this.hydrate(rows);
  }

  async listByUserId(userId: string, filter?: { types?: readonly string[] }): Promise<Artifact[]> {
    const types = filter?.types?.length ? (filter.types as ArtifactRow["type"][]) : undefined;
    const rows = await this.db
      .select()
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.userId, userId),
          isNull(schema.artifacts.deletedAt),
          eq(schema.artifacts.derived, false),
          types ? inArray(schema.artifacts.type, types) : undefined,
        ),
      )
      .orderBy(desc(schema.artifacts.updatedAt), desc(schema.artifacts.id));
    return this.hydrate(rows);
  }

  async listGlobal(type: string): Promise<Artifact[]> {
    const rows = await this.db
      .select()
      .from(schema.artifacts)
      .where(
        and(
          isNull(schema.artifacts.userId),
          isNull(schema.artifacts.deletedAt),
          eq(schema.artifacts.type, type as ArtifactRow["type"]),
        ),
      )
      .orderBy(asc(schema.artifacts.name));
    return this.hydrate(rows);
  }

  private async hydrate(rows: readonly ArtifactRow[]): Promise<Artifact[]> {
    if (rows.length === 0) return [];

    const tagRows = await this.db
      .select({ artifactId: schema.artifactTags.artifactId, name: schema.tags.name })
      .from(schema.artifactTags)
      .innerJoin(schema.tags, eq(schema.artifactTags.tagId, schema.tags.id))
      .where(inArray(schema.artifactTags.artifactId, rows.map((row) => row.id)));
    const tagsByArtifact = new Map<string, string[]>();
    for (const { artifactId, name } of tagRows) {
      tagsByArtifact.set(artifactId, [...(tagsByArtifact.get(artifactId) ?? []), name]);
    }
    return rows.map((row) => mapArtifactRow(row, tagsByArtifact.get(row.id) ?? []));
  }
}
