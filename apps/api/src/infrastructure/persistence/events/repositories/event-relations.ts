import { and, eq, sql } from "drizzle-orm";
import { EventValidationError, SEQUENCE_RELATION, type Event } from "../../../../domain";
import type { SequenceChange } from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { lockUser, type Tx } from "../../shared/tx";

/**
 * O artefato ligado e do usuario ou global. O banco nao confere isso: confere
 * aqui, e o `FOR SHARE` impede que o alvo suma antes do commit.
 */
export async function assertEventReferences(tx: Tx, event: Event): Promise<void> {
  const artifactIds = event.artifactLinks.map((link) => link.artifactId);
  if (artifactIds.length > 0) {
    const found = await tx.execute<{ id: string }>(sql`
      SELECT id FROM artifacts
      WHERE id IN ${artifactIds} AND (user_id = ${event.userId} OR user_id IS NULL) AND deleted_at IS NULL
      ORDER BY id
      FOR SHARE
    `);
    const known = new Set(found.rows.map((row) => row.id));
    const missing = artifactIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new EventValidationError(`Related artifacts not found: ${missing.join(", ")}`);
    }
  }
}

/** Grava as relacoes que saem do evento: os artefatos, na ordem. A sequencia entra pelo lote (`applySequenceChanges`). */
export async function insertEventRelations(tx: Tx, event: Event): Promise<void> {
  if (event.artifactLinks.length === 0) return;
  await tx.insert(schema.eventArtifactRelation).values(
    event.artifactLinks.map((link, position) => ({
      eventId: event.id,
      artifactId: link.artifactId,
      relation: link.relation,
      position,
      fromRecurrence: link.fromRecurrence,
    })),
  );
}

export async function deleteEventRelations(tx: Tx, eventId: string): Promise<void> {
  await tx.delete(schema.eventArtifactRelation).where(eq(schema.eventArtifactRelation.eventId, eventId));
}

/**
 * Aplica as arestas da sequencia: as duas pontas existem e sao do usuario, uma
 * aresta nao repete e a ordem nao fecha ciclo. Nenhum dos eventos e revisado:
 * a sequencia nao e campo de nenhum deles, entao um evento de agente tambem
 * pode ser ponta.
 */
export async function applySequenceChanges(tx: Tx, userId: string, changes: readonly SequenceChange[]): Promise<void> {
  if (changes.length === 0) return;
  // A conferencia de ciclo le o grafo inteiro do usuario: duas escritas ao mesmo tempo esperam uma pela outra.
  await lockUser(tx, userId);

  const added = changes.filter((change) => change.op === "add");
  const ids = [...new Set(added.flatMap((change) => [change.fromId, change.toId]))].sort();
  if (ids.length > 0) {
    const found = await tx.execute<{ id: string }>(sql`
      SELECT id FROM events
      WHERE id IN ${ids} AND user_id = ${userId} AND deleted_at IS NULL
      ORDER BY id
      FOR SHARE
    `);
    const known = new Set(found.rows.map((row) => row.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new EventValidationError(`Related events not found: ${missing.join(", ")}`);
  }

  for (const change of changes) {
    if (change.op !== "remove") continue;
    await tx
      .delete(schema.eventEventRelation)
      .where(
        and(
          eq(schema.eventEventRelation.fromEventId, change.fromId),
          eq(schema.eventEventRelation.toEventId, change.toId),
          eq(schema.eventEventRelation.relation, SEQUENCE_RELATION),
        ),
      );
  }
  if (added.length > 0) {
    await tx
      .insert(schema.eventEventRelation)
      .values(added.map((change) => ({ fromEventId: change.fromId, toEventId: change.toId, relation: SEQUENCE_RELATION })))
      .onConflictDoNothing();
    for (const fromId of new Set(added.map((change) => change.fromId))) await assertAcyclic(tx, fromId);
  }
}

/** A sequencia nao fecha ciclo: seguindo a relacao a partir do evento, ele nao volta a si mesmo. */
async function assertAcyclic(tx: Tx, eventId: string): Promise<void> {
  const result = await tx.execute(sql`
    WITH RECURSIVE reach(id) AS (
      SELECT to_event_id FROM event_event_relation
      WHERE from_event_id = ${eventId} AND relation = ${SEQUENCE_RELATION}
      UNION
      SELECT r.to_event_id FROM event_event_relation r
      JOIN reach ON r.from_event_id = reach.id
      WHERE r.relation = ${SEQUENCE_RELATION}
    )
    SELECT 1 FROM reach WHERE id = ${eventId} LIMIT 1
  `);
  if (result.rows.length > 0) throw new EventValidationError("Events cannot follow each other in a cycle");
}
