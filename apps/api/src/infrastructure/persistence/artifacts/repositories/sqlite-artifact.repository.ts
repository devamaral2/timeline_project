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
import { artifactArtifactRelation, artifacts, artifactTags } from "../../database/tables";
import { sqlList } from "../../database/schema/sets";
import { NOW, sql, type SqlFragment } from "../../sqlite/sql";
import { agentStatusesBefore, REVIEW_SITUATION_ON_CLOSE } from "../../../../domain/agent-status";
import { completeCurrentJob } from "../../../jobs/job-context";
import { appendEntry } from "../../requests/request-rows";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import type { Db, Tx } from "../../shared/tx";
import { upsertTagIds } from "../../shared/upsert-tag-ids";
import { mapArtifactRow, type ArtifactRow } from "../mappers/artifact-row.mapper";
import { startFoodGeneration } from "./food-generation";

export async function insertArtifact(tx: Tx, artifact: Artifact): Promise<void> {
  await tx.execute(
    artifacts.insert({
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
    }),
  );
  await insertArtifactTags(tx, artifact);
  await startFoodGeneration(tx, artifact);
}

async function insertArtifactTags(tx: Tx, artifact: Artifact): Promise<void> {
  if (artifact.tags.length === 0 || !artifact.userId) return;

  const tagIds = await upsertTagIds(tx, artifact.userId, artifact.tags);
  await tx.execute(artifactTags.insert(tagIds.map((tagId) => ({ artifactId: artifact.id, tagId }))));
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
        data = ${sql.json(artifact.data)},
        revision = ${artifact.revision},
        updated_at = ${NOW}
    WHERE id = ${artifact.id}
      AND user_id = ${actorUserId}
      AND revision = ${expectedRevision}
      AND deleted_at IS NULL
    RETURNING revision
  `);

  if (result.rows.length > 0) {
    await tx.execute(sql`DELETE FROM artifact_tags WHERE artifact_id = ${artifact.id}`);
    await insertArtifactTags(tx, artifact);
    return;
  }

  const existing = await tx.get<{ userId: string | null; revision: number }>(sql`
    SELECT user_id AS "userId", revision FROM artifacts WHERE id = ${artifact.id} AND deleted_at IS NULL`);

  classifyUpdateFailure(existing ? { userId: existing.userId ?? "", revision: existing.revision } : undefined, actorUserId, expectedRevision, {
    notFound: () => new ArtifactNotFoundError(`Artifact not found: ${artifact.id}`),
    ownership: () => new ArtifactOwnershipError(),
    conflict: (message) => new ArtifactRevisionConflictError(message),
  });
}

/**
 * Grava os artefatos que viajam com uma tarefa ou uma serie. Vem antes das
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
  await tx.execute(
    artifactArtifactRelation.insert(
      derivations.map(({ originalId, copyId }) => ({
        fromArtifactId: originalId,
        toArtifactId: copyId,
        relation: "derives" as const,
      })),
    ),
  );
}

/**
 * Soft delete: as relacoes ficam e a leitura filtra `deleted_at IS NULL`.
 * Apagar uma tarefa nao apaga os artefatos dela; so solta a relacao.
 */
export async function softDeleteArtifact(tx: Tx, artifactId: string, actorUserId: string): Promise<void> {
  const existing = await tx.get<{ userId: string | null }>(sql`
    SELECT user_id AS "userId" FROM artifacts WHERE id = ${artifactId} AND deleted_at IS NULL`);

  if (!existing) throw new ArtifactNotFoundError(`Artifact not found: ${artifactId}`);
  if (existing.userId !== actorUserId) throw new ArtifactOwnershipError();

  await tx.execute(sql`UPDATE artifacts SET deleted_at = ${NOW}, updated_at = ${NOW} WHERE id = ${artifactId}`);
}

export class SqliteArtifactRepository implements ArtifactRepository, FoodGenerationRepository {
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
          SET data = ${sql.json(data)},
              revision = revision + 1,
              updated_at = ${NOW}
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

      // O pedido de construcao que altera este alimento termina junto com a escrita, so de onde a tabela deixa.
      const closing = final === "failed" ? "failed" : "completed";
      const requests = await tx.execute<{ id: string }>(sql`
        UPDATE tasks AS e
        SET status = ${closing}, situation = ${REVIEW_SITUATION_ON_CLOSE},
            finished_at = ${NOW}, updated_at = ${NOW}
        FROM task_artifact_relation r
        WHERE r.artifact_id = ${payload.artifactId} AND r.task_id = e.id
          AND e.actor = 'agent' AND e.kind = 'build_request' AND e.status IN (${sqlList(agentStatusesBefore(closing))})
          AND e.data->>'route' = 'food'
        RETURNING id
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

    const rows = await this.db.all(
      sql`SELECT ${artifacts.select()} FROM artifacts WHERE id IN ${sql.in(artifactIds)} AND deleted_at IS NULL`,
      artifacts,
    );
    return this.hydrate(rows);
  }

  async listByUserId(userId: string, filter?: { types?: readonly string[] }): Promise<Artifact[]> {
    const types: SqlFragment = filter?.types?.length ? sql`AND type IN ${sql.in(filter.types)}` : sql.empty;
    const rows = await this.db.all(
      sql`SELECT ${artifacts.select()} FROM artifacts
          WHERE user_id = ${userId} AND deleted_at IS NULL AND NOT derived ${types}
          ORDER BY updated_at DESC, id DESC`,
      artifacts,
    );
    return this.hydrate(rows);
  }

  async listGlobal(type: string): Promise<Artifact[]> {
    const rows = await this.db.all(
      sql`SELECT ${artifacts.select()} FROM artifacts
          WHERE user_id IS NULL AND deleted_at IS NULL AND type = ${type}
          ORDER BY name`,
      artifacts,
    );
    return this.hydrate(rows);
  }

  private async hydrate(rows: readonly ArtifactRow[]): Promise<Artifact[]> {
    if (rows.length === 0) return [];

    const tagRows = await this.db.all<{ artifactId: string; name: string }>(sql`
      SELECT atg.artifact_id AS "artifactId", t.name AS "name"
      FROM artifact_tags atg JOIN tags t ON t.id = atg.tag_id
      WHERE atg.artifact_id IN ${sql.in(rows.map((row) => row.id))}`);
    const tagsByArtifact = new Map<string, string[]>();
    for (const { artifactId, name } of tagRows) {
      tagsByArtifact.set(artifactId, [...(tagsByArtifact.get(artifactId) ?? []), name]);
    }
    return rows.map((row) => mapArtifactRow(row, tagsByArtifact.get(row.id) ?? []));
  }
}
