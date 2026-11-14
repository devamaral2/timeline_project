import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { EntityBatchConflictError, EventValidationError, type ArtifactLink, type Event } from "../../../domain";
import type { EntityBatch } from "../../../domain/ports";
import { jobContext, type CurrentJob } from "../../jobs/job-context";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresDatabase } from "../database/postgres-database";
import * as schema from "../database/schema";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresJobStore } from "../jobs/postgres-job.store";
import { PostgresRecurrenceRepository } from "../recurrences/repositories/postgres-recurrence.repository";
import { insertAgentEvent } from "../requests/request-rows";
import type { Tx } from "../shared/tx";
import {
  OTHER_USER,
  USER,
  countRows,
  dailyRecurrence,
  foodArtifact,
  occurrenceOf,
  selectRows,
  textArtifact,
  trackedEvent,
} from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const link = (artifactId: string, relation: ArtifactLink["relation"] = "uses"): ArtifactLink => ({
  artifactId,
  relation,
  fromRecurrence: false,
});

const batchOf = (overrides: Partial<EntityBatch>): EntityBatch => ({ userId: USER, events: [], artifacts: [], ...overrides });

describe("PostgresEntityBatchWriter", () => {
  let ctx: PostgresTestContext;
  let writer: PostgresEntityBatchWriter;
  let events: PostgresEventRepository;
  let artifacts: PostgresArtifactRepository;
  let recurrences: PostgresRecurrenceRepository;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    writer = new PostgresEntityBatchWriter(ctx.db);
    events = new PostgresEventRepository(ctx.db);
    artifacts = new PostgresArtifactRepository(ctx.db);
    recurrences = new PostgresRecurrenceRepository(ctx.db);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  async function saved(event: Event): Promise<Event> {
    await events.save(event);
    return event;
  }

  describe("lote de artefatos e eventos", () => {
    test("grava os artefatos novos, os eventos novos e a edicao do evento de origem", async () => {
      const origin = await saved(trackedEvent(USER, "Planejar a semana"));
      const existing = textArtifact(USER, "rascunho");
      await artifacts.save(existing);
      const note = textArtifact(USER, "cardapio da semana");
      const created = trackedEvent(USER, "Fazer as compras", { artifactLinks: [link(note.id, "creates"), link(existing.id)] });

      const result = await writer.commit(
        batchOf({
          artifacts: [
            { op: "create", entity: note },
            { op: "update", entity: existing.revise({ data: { body: "versao final" } }), expectedRevision: 1 },
          ],
          events: [
            { op: "update", entity: origin.revise({ name: "Semana planejada", subtaskIds: [created.id] }), expectedRevision: 1 },
            { op: "create", entity: created },
          ],
        }),
      );

      expect(result).toEqual({});
      expect(await events.findById(origin.id)).toMatchObject({ name: "Semana planejada", revision: 2, subtaskIds: [created.id] });
      expect((await events.findById(created.id))?.artifactLinks).toEqual([link(note.id, "creates"), link(existing.id)]);
      expect(await artifacts.findById(note.id)).not.toBeNull();
      expect(await artifacts.findById(existing.id)).toMatchObject({ data: { body: "versao final" }, revision: 2 });
    });

    test("apaga eventos e artefatos na revisao esperada, sem tirar a linha", async () => {
      const event = await saved(trackedEvent(USER, "Sai"));
      const note = textArtifact(USER, "sai tambem");
      await artifacts.save(note);

      await writer.commit(
        batchOf({
          events: [{ op: "delete", id: event.id, expectedRevision: 1 }],
          artifacts: [{ op: "delete", id: note.id, expectedRevision: 1 }],
        }),
      );

      expect(await events.findById(event.id)).toBeNull();
      expect(await artifacts.findById(note.id)).toBeNull();
      expect(await countRows(ctx.pool, "events", "deleted_at IS NOT NULL")).toBe(1);
      expect(await countRows(ctx.pool, "artifacts", "deleted_at IS NOT NULL")).toBe(1);
    });

    test("alvo com revisao desatualizada, de outro usuario ou apagado recusa o lote inteiro", async () => {
      const mine = await saved(trackedEvent(USER, "Meu"));
      const edited = await saved(trackedEvent(USER, "Editado por outra requisicao"));
      await events.update(edited.revise({ name: "Ja mudou" }), USER, 1);
      const foreign = await saved(trackedEvent(OTHER_USER, "Do outro"));
      const removed = await saved(trackedEvent(USER, "Apagado"));
      await events.delete(removed.id, USER);
      const staleNote = textArtifact(USER, "nota");
      const foreignNote = textArtifact(OTHER_USER, "nota do outro");
      for (const artifact of [staleNote, foreignNote]) await artifacts.save(artifact);
      await artifacts.update(staleNote.revise({ data: { body: "ja mudou" } }), USER, 1);

      const conflicts: Array<[string, Partial<EntityBatch>]> = [
        ["evento desatualizado", { events: [{ op: "update", entity: edited.revise({ name: "Atrasado" }), expectedRevision: 1 }] }],
        ["evento desatualizado, ao apagar", { events: [{ op: "delete", id: edited.id, expectedRevision: 1 }] }],
        ["evento de outro usuario", { events: [{ op: "update", entity: foreign.revise({ name: "Invadido" }), expectedRevision: 1 }] }],
        ["evento de outro usuario, ao apagar", { events: [{ op: "delete", id: foreign.id, expectedRevision: 1 }] }],
        ["evento apagado", { events: [{ op: "update", entity: removed.revise({ name: "Voltou" }), expectedRevision: 1 }] }],
        ["artefato desatualizado", { artifacts: [{ op: "update", entity: staleNote.revise({ data: { body: "atrasado" } }), expectedRevision: 1 }] }],
        ["artefato de outro usuario", { artifacts: [{ op: "delete", id: foreignNote.id, expectedRevision: 1 }] }],
      ];
      for (const [what, conflict] of conflicts) {
        const note = textArtifact(USER, "nasceria com o lote");
        const created = trackedEvent(USER, "Nasceria com o lote", { artifactLinks: [link(note.id, "creates")] });

        await expect(
          writer.commit(
            batchOf({
              artifacts: [{ op: "create", entity: note }, ...(conflict.artifacts ?? [])],
              events: [
                { op: "create", entity: created },
                { op: "update", entity: mine.revise({ name: "Nao deveria mudar" }), expectedRevision: 1 },
                ...(conflict.events ?? []),
              ],
            }),
          ),
          what,
        ).rejects.toThrow(EntityBatchConflictError);

        expect(await artifacts.findById(note.id), what).toBeNull();
        expect(await events.findById(created.id), what).toBeNull();
        expect(await events.findById(mine.id), what).toMatchObject({ name: "Meu", revision: 1 });
      }
      expect(await events.findById(foreign.id)).toMatchObject({ name: "Do outro", revision: 1 });
      expect(await artifacts.findById(foreignNote.id)).not.toBeNull();
    });

    test("um alvo de relacao que sumiu entre preparar e gravar recusa o lote", async () => {
      const removed = await saved(trackedEvent(USER, "Apagado no meio do caminho"));
      await events.delete(removed.id, USER);
      const note = textArtifact(USER, "nasceria com o lote");

      await expect(
        writer.commit(
          batchOf({
            artifacts: [{ op: "create", entity: note }],
            events: [{ op: "create", entity: trackedEvent(USER, "Novo", { subtaskIds: [removed.id] }) }],
          }),
        ),
      ).rejects.toThrow(EntityBatchConflictError);

      expect(await artifacts.findById(note.id)).toBeNull();
    });

    test("uma relacao que fecharia ciclo recusa o lote como erro de validacao", async () => {
      const child = await saved(trackedEvent(USER, "Filho"));
      const parent = await saved(trackedEvent(USER, "Pai", { subtaskIds: [child.id] }));
      const note = textArtifact(USER, "nasceria com o lote");

      await expect(
        writer.commit(
          batchOf({
            artifacts: [{ op: "create", entity: note }],
            events: [{ op: "update", entity: child.revise({ subtaskIds: [parent.id] }), expectedRevision: 1 }],
          }),
        ),
      ).rejects.toThrow(EventValidationError);

      expect(await artifacts.findById(note.id)).toBeNull();
      expect((await events.findById(child.id))?.revision).toBe(1);
    });

    test("eventos novos que apontam um para o outro entram na ordem da dependencia", async () => {
      const leaf = trackedEvent(USER, "Comprar tinta");
      const middle = trackedEvent(USER, "Pintar a sala", { blocksIds: [leaf.id] });
      const root = trackedEvent(USER, "Reforma", { subtaskIds: [middle.id, leaf.id] });

      // A raiz vem primeiro no lote: gravada nessa ordem, apontaria para eventos que ainda nao existem.
      await writer.commit(batchOf({ events: [root, middle, leaf].map((entity) => ({ op: "create" as const, entity })) }));

      expect([...((await events.findById(root.id))?.subtaskIds ?? [])].sort()).toEqual([middle.id, leaf.id].sort());
      expect((await events.findById(middle.id))?.blocksIds).toEqual([leaf.id]);
      expect(await events.findById(leaf.id)).toMatchObject({ parentIds: [root.id], blockedByIds: [middle.id] });
    });

    test("eventos novos que fecham ciclo entre si recusam o lote", async () => {
      const [idA, idB] = [ulid(), ulid()];
      const a = trackedEvent(USER, "A", { id: idA, subtaskIds: [idB] });
      const b = trackedEvent(USER, "B", { id: idB, subtaskIds: [idA] });

      await expect(
        writer.commit(batchOf({ events: [a, b].map((entity) => ({ op: "create" as const, entity })) })),
      ).rejects.toThrow();

      expect(await countRows(ctx.pool, "events")).toBe(0);
    });

    test("derivations registra de qual original saiu cada copia, sem editar nenhum dos dois", async () => {
      const original = foodArtifact(USER, "Pizza", 800);
      await artifacts.save(original);
      const copy = original.copyForEvent(USER, "2 fatias");
      const meal = trackedEvent(USER, "Jantar", { kind: "meal", artifactLinks: [link(copy.id)] });

      await writer.commit(
        batchOf({
          artifacts: [{ op: "create", entity: copy }],
          derivations: [{ originalId: original.id, copyId: copy.id }],
          events: [{ op: "create", entity: meal }],
        }),
      );

      expect(await selectRows(ctx.pool, "SELECT from_artifact_id, to_artifact_id, relation FROM artifact_artifact_relation")).toEqual([
        { from_artifact_id: original.id, to_artifact_id: copy.id, relation: "derives" },
      ]);
      expect((await artifacts.findById(original.id))?.revision).toBe(1);
      expect(await artifacts.findById(copy.id)).toMatchObject({ derived: true, revision: 1, data: { quantity: "2 fatias" } });
      // A copia e do evento: nao aparece na lista de artefatos do usuario.
      expect((await artifacts.listByUserId(USER)).map((artifact) => artifact.id)).toEqual([original.id]);
    });
  });

  describe("afterWrite", () => {
    test("roda na mesma transacao: enxerga o que o lote gravou e o que ele grava entra junto", async () => {
      const created = trackedEvent(USER, "Criado pelo passo");
      const stepId = ulid();
      let seenInsideTransaction = 0;
      let seenOutsideTransaction = -1;

      await writer.commit(
        batchOf({
          events: [{ op: "create", entity: created }],
          afterWrite: async (transaction) => {
            const tx = transaction as Tx;
            seenInsideTransaction = (await tx.execute(sql`SELECT 1 FROM events WHERE id = ${created.id}`)).rows.length;
            seenOutsideTransaction = await countRows(ctx.pool, "events");
            await insertAgentEvent(tx, { id: stepId, userId: USER, kind: "step", status: "done", name: "Passo", data: {} });
            await tx.insert(schema.eventEventRelation).values({ fromEventId: stepId, toEventId: created.id, relation: "generates" });
          },
        }),
      );

      expect(seenInsideTransaction).toBe(1);
      expect(seenOutsideTransaction).toBe(0);
      expect(await selectRows(ctx.pool, "SELECT from_event_id, to_event_id, relation FROM event_event_relation")).toEqual([
        { from_event_id: stepId, to_event_id: created.id, relation: "generates" },
      ]);
    });

    test("se ele falha, nada do lote fica", async () => {
      const origin = await saved(trackedEvent(USER, "Origem"));
      const note = textArtifact(USER, "nasceria com o lote");

      await expect(
        writer.commit(
          batchOf({
            artifacts: [{ op: "create", entity: note }],
            events: [
              { op: "create", entity: trackedEvent(USER, "Nasceria com o lote") },
              { op: "delete", id: origin.id, expectedRevision: 1 },
            ],
            afterWrite: async () => {
              throw new Error("o passo nao pode ser gravado");
            },
          }),
        ),
      ).rejects.toThrow("o passo nao pode ser gravado");

      expect(await artifacts.findById(note.id)).toBeNull();
      expect(await countRows(ctx.pool, "events")).toBe(1);
      expect(await events.findById(origin.id)).not.toBeNull();
    });
  });

  describe("series", () => {
    const DAYS = ["2026-11-10", "2026-11-11", "2026-11-12"] as const;

    async function seriesWithOccurrences() {
      const recurrence = dailyRecurrence(USER, DAYS[0]);
      await recurrences.save(recurrence);
      const occurrences = DAYS.map((day) => occurrenceOf(recurrence, day));
      await recurrences.materialize(recurrence.materializedUntil(DAYS[2]), occurrences);
      return { recurrence, occurrences };
    }

    const occurrenceIds = async () =>
      (await selectRows(ctx.pool, "SELECT id FROM events ORDER BY started_at")).map((row) => row.id);

    test("a serie nova entra antes da primeira ocorrencia que o lote traz", async () => {
      const recurrence = dailyRecurrence(USER, DAYS[0]);
      const first = occurrenceOf(recurrence, DAYS[0]);

      await writer.commit(batchOf({ recurrences: [recurrence], events: [{ op: "create", entity: first }] }));

      expect(await recurrences.findById(recurrence.id)).toMatchObject({ revision: 1, materializedThrough: undefined });
      expect((await events.findById(first.id))?.occurrence).toEqual({
        recurrenceId: recurrence.id,
        occurrenceOn: DAYS[0],
        detached: false,
      });
    });

    test("duas ocorrencias do mesmo dia no lote recusam o lote, com a serie", async () => {
      const recurrence = dailyRecurrence(USER, DAYS[0]);

      await expect(
        writer.commit(
          batchOf({
            recurrences: [recurrence],
            events: [occurrenceOf(recurrence, DAYS[0]), occurrenceOf(recurrence, DAYS[0])].map((entity) => ({
              op: "create" as const,
              entity,
            })),
          }),
        ),
      ).rejects.toThrow(EntityBatchConflictError);

      expect(await recurrences.findById(recurrence.id)).toBeNull();
      expect(await countRows(ctx.pool, "events")).toBe(0);
    });

    test("a serie editada libera os dias de fromDay em diante para a primeira ocorrencia nova", async () => {
      const { recurrence, occurrences } = await seriesWithOccurrences();
      const revised = recurrence.revise({ rule: { timeOfDay: "19:00" }, template: { name: "Serie nova", kind: "routine" } });
      const replacement = occurrenceOf(revised, DAYS[1]);

      await writer.commit(
        batchOf({
          recurrenceChanges: [{ op: "update", recurrence: revised, expectedRevision: 1, fromDay: DAYS[1] }],
          events: [{ op: "create", entity: replacement }],
        }),
      );

      expect(await occurrenceIds()).toEqual([occurrences[0].id, replacement.id]);
      expect(await recurrences.findById(recurrence.id)).toMatchObject({ revision: 2, template: { name: "Serie nova" } });
    });

    test("serie com revisao desatualizada ou inexistente recusa o lote inteiro", async () => {
      const { recurrence, occurrences } = await seriesWithOccurrences();
      const changes: EntityBatch["recurrenceChanges"][] = [
        [{ op: "update", recurrence: recurrence.revise({ rule: { timeOfDay: "19:00" } }), expectedRevision: 5, fromDay: DAYS[0] }],
        [{ op: "delete", id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", fromDay: DAYS[0] }],
      ];
      for (const recurrenceChanges of changes) {
        const note = textArtifact(USER, "nasceria com o lote");

        await expect(
          writer.commit(batchOf({ artifacts: [{ op: "create", entity: note }], recurrenceChanges })),
        ).rejects.toThrow(EntityBatchConflictError);

        expect(await artifacts.findById(note.id)).toBeNull();
      }
      expect(await occurrenceIds()).toEqual(occurrences.map((event) => event.id));
      expect((await recurrences.findById(recurrence.id))?.revision).toBe(1);
    });

    test("serie de outro usuario nao e editada nem apagada, e nada do lote fica", async () => {
      const { recurrence, occurrences } = await seriesWithOccurrences();
      const changes: EntityBatch["recurrenceChanges"][] = [
        [{ op: "update", recurrence: recurrence.revise({ rule: { timeOfDay: "19:00" } }), expectedRevision: 1, fromDay: DAYS[0] }],
        [{ op: "delete", id: recurrence.id, fromDay: DAYS[0] }],
      ];
      for (const recurrenceChanges of changes) {
        const note = textArtifact(OTHER_USER, "nasceria com o lote");

        await expect(
          writer.commit(batchOf({ userId: OTHER_USER, artifacts: [{ op: "create", entity: note }], recurrenceChanges })),
        ).rejects.toThrow();

        expect(await artifacts.findById(note.id)).toBeNull();
      }
      expect(await occurrenceIds()).toEqual(occurrences.map((event) => event.id));
      expect((await recurrences.findById(recurrence.id))?.revision).toBe(1);
    });

    test("apagar a serie no lote tira as ocorrencias de fromDay em diante e solta as anteriores", async () => {
      const { recurrence, occurrences } = await seriesWithOccurrences();

      await writer.commit(batchOf({ recurrenceChanges: [{ op: "delete", id: recurrence.id, fromDay: DAYS[1] }] }));

      expect(await recurrences.findById(recurrence.id)).toBeNull();
      expect(await occurrenceIds()).toEqual([occurrences[0].id]);
      expect((await events.findById(occurrences[0].id))?.occurrence).toBeUndefined();
    });
  });

  describe("dentro de um job", () => {
    async function runningJob(): Promise<{ store: PostgresJobStore; current: CurrentJob }> {
      const store = new PostgresJobStore(new PostgresDatabase(ctx.pool), 3000, 3);
      await store.enqueue({ kind: "agent-batch", userId: USER, actorId: USER, payload: {} });
      const [job] = await store.claim(["agent-batch"], 1);
      return { store, current: { id: job.id, token: job.leaseToken as string } };
    }

    test("o lote encerra o job na mesma transacao", async () => {
      const { store, current } = await runningJob();
      const created = trackedEvent(USER, "Criado pelo job");

      await jobContext.run(current, () => writer.commit(batchOf({ events: [{ op: "create", entity: created }] })));

      expect(await store.get(current.id)).toMatchObject({ status: "succeeded", error: null });
      expect(current.completed).toBe(true);
      expect(await events.findById(created.id)).not.toBeNull();
    });

    test("com o lease vencido ou o job cancelado, o lote volta inteiro", async () => {
      const losses = [
        "UPDATE jobs SET lease_until = clock_timestamp() - interval '1 second'",
        "UPDATE jobs SET lease_token = 'outro-worker'",
        "UPDATE jobs SET status = 'cancelled'",
      ];
      for (const loss of losses) {
        await ctx.reset();
        const { current } = await runningJob();
        const origin = await saved(trackedEvent(USER, "Origem"));
        const note = textArtifact(USER, "nasceria com o lote");
        await ctx.pool.query(loss);

        await expect(
          jobContext.run(current, () =>
            writer.commit(
              batchOf({
                artifacts: [{ op: "create", entity: note }],
                events: [{ op: "update", entity: origin.revise({ name: "Nao deveria mudar" }), expectedRevision: 1 }],
              }),
            ),
          ),
          loss,
        ).rejects.toThrow(/Job lease lost or cancelled/);

        expect(current.completed, loss).toBeUndefined();
        expect(await artifacts.findById(note.id), loss).toBeNull();
        expect(await events.findById(origin.id), loss).toMatchObject({ name: "Origem", revision: 1 });
      }
    });

    test("fora de um job, o lote nao toca na fila", async () => {
      const { store, current } = await runningJob();

      await writer.commit(batchOf({ events: [{ op: "create", entity: trackedEvent(USER, "Sem job") }] }));

      expect(await store.get(current.id)).toMatchObject({ status: "running" });
    });
  });
});
