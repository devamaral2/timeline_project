import { and, eq, inArray, sql } from "drizzle-orm";
import { EventValidationError, type Event } from "../../../../domain";
import * as schema from "../../database/schema";
import { lockUser, type Tx } from "../../shared/tx";

/** As relacoes entre eventos que o usuario edita. As demais so o agente escreve. */
export const HUMAN_EVENT_RELATIONS = ["subtask", "blocks"] as const;
export type HumanEventRelation = (typeof HUMAN_EVENT_RELATIONS)[number];

/**
 * As duas pontas de uma relacao pertencem ao mesmo usuario, e um artefato
 * ligado e do usuario ou global. O banco nao confere isso: confere aqui, e o
 * `FOR SHARE` impede que o alvo suma antes do commit.
 */
export async function assertEventReferences(tx: Tx, event: Event): Promise<void> {
  const eventIds = [...new Set([...event.subtaskIds, ...event.blocksIds])];
  if (eventIds.length > 0) {
    const found = await tx.execute<{ id: string }>(sql`
      SELECT id FROM events
      WHERE id IN ${eventIds} AND user_id = ${event.userId} AND deleted_at IS NULL
      ORDER BY id
      FOR SHARE
    `);
    const known = new Set(found.rows.map((row) => row.id));
    const missing = eventIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new EventValidationError(`Related events not found: ${missing.join(", ")}`);
    }
  }

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

/** Grava as relacoes que saem do evento: os artefatos, na ordem, e as subtarefas e os bloqueios. */
export async function insertEventRelations(tx: Tx, event: Event): Promise<void> {
  if (event.artifactLinks.length > 0) {
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

  const outgoing = [
    ...event.subtaskIds.map((toEventId) => ({ fromEventId: event.id, toEventId, relation: "subtask" as const })),
    ...event.blocksIds.map((toEventId) => ({ fromEventId: event.id, toEventId, relation: "blocks" as const })),
  ];
  if (outgoing.length === 0) return;

  // A conferencia de ciclo le o grafo inteiro do usuario: duas escritas ao mesmo tempo esperam uma pela outra.
  await lockUser(tx, event.userId);
  await tx.insert(schema.eventEventRelation).values(outgoing);
  if (event.subtaskIds.length > 0) await assertAcyclic(tx, event.id, "subtask");
  if (event.blocksIds.length > 0) await assertAcyclic(tx, event.id, "blocks");
}

export async function deleteEventRelations(tx: Tx, eventId: string): Promise<void> {
  await tx.delete(schema.eventArtifactRelation).where(eq(schema.eventArtifactRelation.eventId, eventId));
  await tx
    .delete(schema.eventEventRelation)
    .where(
      and(
        eq(schema.eventEventRelation.fromEventId, eventId),
        inArray(schema.eventEventRelation.relation, [...HUMAN_EVENT_RELATIONS]),
      ),
    );
}

/** Subtarefa e bloqueio nao fecham ciclo: seguindo a relacao a partir do evento, ele nao volta a si mesmo. */
async function assertAcyclic(tx: Tx, eventId: string, relation: HumanEventRelation): Promise<void> {
  const result = await tx.execute(sql`
    WITH RECURSIVE reach(id) AS (
      SELECT to_event_id FROM event_event_relation
      WHERE from_event_id = ${eventId} AND relation = ${relation}
      UNION
      SELECT r.to_event_id FROM event_event_relation r
      JOIN reach ON r.from_event_id = reach.id
      WHERE r.relation = ${relation}
    )
    SELECT 1 FROM reach WHERE id = ${eventId} LIMIT 1
  `);
  if (result.rows.length > 0) {
    throw new EventValidationError(
      relation === "subtask" ? "A subtask cannot contain the event it belongs to" : "Events cannot block each other in a cycle",
    );
  }
}
