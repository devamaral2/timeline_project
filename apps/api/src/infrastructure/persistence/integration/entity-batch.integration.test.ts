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
  agentEvent,
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

const batchOf = (overrides: Partial<EntityBatch>): EntityBatch => ({ userId: USER, tasks: [], artifacts: [], ...overrides });

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
          tasks: [
            { op: "update", entity: origin.revise({ name: "Semana planejada" }), expectedRevision: 1 },
            { op: "create", entity: created },
          ],
          sequence: [{ op: "add", fromId: origin.id, toId: created.id }],
        }),
      );

      expect(result).toEqual({});
      expect(await events.findById(origin.id)).toMatchObject({ name: "Semana planejada", revision: 2, nextIds: [created.id] });
      expect(await events.findById(created.id)).toMatchObject({ previousIds: [origin.id], revision: 1 });
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
          tasks: [{ op: "delete", id: event.id, expectedRevision: 1 }],
          artifacts: [{ op: "delete", id: note.id, expectedRevision: 1 }],
        }),
      );

      expect(await events.findById(event.id)).toBeNull();
      expect(await artifacts.findById(note.id)).toBeNull();
      expect(await countRows(ctx.pool, "tasks", "deleted_at IS NOT NULL")).toBe(1);
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
        ["evento desatualizado", { tasks: [{ op: "update", entity: edited.revise({ name: "Atrasado" }), expectedRevision: 1 }] }],
        ["evento desatualizado, ao apagar", { tasks: [{ op: "delete", id: edited.id, expectedRevision: 1 }] }],
        ["evento de outro usuario", { tasks: [{ op: "update", entity: foreign.revise({ name: "Invadido" }), expectedRevision: 1 }] }],
        ["evento de outro usuario, ao apagar", { tasks: [{ op: "delete", id: foreign.id, expectedRevision: 1 }] }],
        ["evento apagado", { tasks: [{ op: "update", entity: removed.revise({ name: "Voltou" }), expectedRevision: 1 }] }],
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
              tasks: [
                { op: "create", entity: created },
                { op: "update", entity: mine.revise({ name: "Nao deveria mudar" }), expectedRevision: 1 },
                ...(conflict.tasks ?? []),
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

    test("um alvo de artefato que sumiu entre preparar e gravar recusa o lote", async () => {
      const removed = textArtifact(USER, "apagado no meio do caminho");
      await artifacts.save(removed);
      await artifacts.delete(removed.id, USER);
      const note = textArtifact(USER, "nasceria com o lote");

      await expect(
        writer.commit(
          batchOf({
            artifacts: [{ op: "create", entity: note }],
            tasks: [{ op: "create", entity: trackedEvent(USER, "Novo", { artifactLinks: [link(removed.id)] }) }],
          }),
        ),
      ).rejects.toThrow(/Related artifacts not found/);

      expect(await artifacts.findById(note.id)).toBeNull();
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
          tasks: [{ op: "create", entity: meal }],
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

  describe("sequencia entre eventos", () => {
    const sequence = (...pairs: Array<[string, string]>): EntityBatch["sequence"] =>
      pairs.map(([fromId, toId]) => ({ op: "add" as const, fromId, toId }));
    const edges = () =>
      selectRows(ctx.pool, "SELECT from_task_id, to_task_id, relation FROM task_task_relation ORDER BY relation, from_task_id");

    test("add grava a aresta precedes, lida nos dois lados, sem revisar nenhum dos eventos", async () => {
      const a = await saved(trackedEvent(USER, "Escolher a cor"));
      const b = await saved(trackedEvent(USER, "Comprar tinta"));

      await writer.commit(batchOf({ sequence: sequence([a.id, b.id]) }));

      expect(await edges()).toEqual([{ from_task_id: a.id, to_task_id: b.id, relation: "precedes" }]);
      expect(await events.findById(a.id)).toMatchObject({ previousIds: [], nextIds: [b.id], revision: 1 });
      expect(await events.findById(b.id)).toMatchObject({ previousIds: [a.id], nextIds: [], revision: 1 });
    });

    test("repetir a aresta, no mesmo lote ou em outro, nao duplica", async () => {
      const a = await saved(trackedEvent(USER, "A"));
      const b = await saved(trackedEvent(USER, "B"));

      await writer.commit(batchOf({ sequence: sequence([a.id, b.id], [a.id, b.id]) }));
      await writer.commit(batchOf({ sequence: sequence([a.id, b.id]) }));

      expect(await countRows(ctx.pool, "task_task_relation", "relation = 'precedes'")).toBe(1);
      expect((await events.findById(b.id))?.previousIds).toEqual([a.id]);
    });

    test("remove tira so a aresta pedida, e remover o que nao existe nao e erro", async () => {
      const [a, b, c] = [await saved(trackedEvent(USER, "A")), await saved(trackedEvent(USER, "B")), await saved(trackedEvent(USER, "C"))];
      await writer.commit(batchOf({ sequence: sequence([a.id, b.id], [a.id, c.id]) }));

      await writer.commit(
        batchOf({
          sequence: [
            { op: "remove", fromId: a.id, toId: b.id },
            { op: "remove", fromId: b.id, toId: c.id },
          ],
        }),
      );

      expect(await edges()).toEqual([{ from_task_id: a.id, to_task_id: c.id, relation: "precedes" }]);
      expect((await events.findById(b.id))?.previousIds).toEqual([]);
      expect((await events.findById(b.id))?.revision).toBe(1);
    });

    test("remover e acrescentar a mesma aresta no lote deixa a aresta no fim", async () => {
      const a = await saved(trackedEvent(USER, "A"));
      const b = await saved(trackedEvent(USER, "B"));
      await writer.commit(batchOf({ sequence: sequence([a.id, b.id]) }));

      await writer.commit(batchOf({ sequence: [{ op: "remove", fromId: a.id, toId: b.id }, { op: "add", fromId: a.id, toId: b.id }] }));

      expect(await countRows(ctx.pool, "task_task_relation", "relation = 'precedes'")).toBe(1);
    });

    test("uma ponta pode ser evento novo do mesmo lote, mesmo listado depois da aresta", async () => {
      const existing = await saved(trackedEvent(USER, "Ja existe"));
      const fresh = trackedEvent(USER, "Nasce com o lote");
      const freshToo = trackedEvent(USER, "Tambem nasce");

      await writer.commit(
        batchOf({
          tasks: [fresh, freshToo].map((entity) => ({ op: "create" as const, entity })),
          sequence: sequence([existing.id, fresh.id], [fresh.id, freshToo.id]),
        }),
      );

      expect(await events.findById(fresh.id)).toMatchObject({ previousIds: [existing.id], nextIds: [freshToo.id] });
      expect((await events.findById(existing.id))?.nextIds).toEqual([fresh.id]);
    });

    test("uma ponta pode ser evento de agente", async () => {
      const request = await saved(agentEvent(USER, "Montar o cardapio", { kind: "build_request" }));
      const person = await saved(trackedEvent(USER, "Fazer as compras"));

      await writer.commit(batchOf({ sequence: sequence([request.id, person.id]) }));

      expect(await events.findById(request.id)).toMatchObject({ nextIds: [person.id], revision: 1 });
      expect((await events.findById(person.id))?.previousIds).toEqual([request.id]);
    });

    test("a sequencia nao revisa o evento editado no mesmo lote alem da propria edicao", async () => {
      const a = await saved(trackedEvent(USER, "A"));
      const b = await saved(trackedEvent(USER, "B"));

      await writer.commit(
        batchOf({
          tasks: [{ op: "update", entity: a.revise({ name: "A editado" }), expectedRevision: 1 }],
          sequence: sequence([a.id, b.id]),
        }),
      );

      expect(await events.findById(a.id)).toMatchObject({ name: "A editado", revision: 2, nextIds: [b.id] });
      expect((await events.findById(b.id))?.revision).toBe(1);
    });

    test("ciclo direto, por um terceiro ou do evento consigo mesmo recusa o lote", async () => {
      const [a, b, c] = [await saved(trackedEvent(USER, "A")), await saved(trackedEvent(USER, "B")), await saved(trackedEvent(USER, "C"))];
      await writer.commit(batchOf({ sequence: sequence([a.id, b.id], [b.id, c.id]) }));

      for (const [what, pair] of [
        ["direto", [b.id, a.id]],
        ["por um terceiro", [c.id, a.id]],
      ] as const) {
        const note = textArtifact(USER, "nasceria com o lote");
        await expect(
          writer.commit(batchOf({ artifacts: [{ op: "create", entity: note }], sequence: sequence([...pair]) })),
          what,
        ).rejects.toThrow(/Events cannot follow each other in a cycle/);
        expect(await artifacts.findById(note.id), what).toBeNull();
      }
      await expect(writer.commit(batchOf({ sequence: sequence([a.id, a.id]) }))).rejects.toThrow();

      expect(await countRows(ctx.pool, "task_task_relation", "relation = 'precedes'")).toBe(2);
    });

    test("eventos novos que fecham ciclo entre si recusam o lote inteiro", async () => {
      const [a, b] = [trackedEvent(USER, "A", { id: ulid() }), trackedEvent(USER, "B", { id: ulid() })];

      await expect(
        writer.commit(
          batchOf({
            tasks: [a, b].map((entity) => ({ op: "create" as const, entity })),
            sequence: sequence([a.id, b.id], [b.id, a.id]),
          }),
        ),
      ).rejects.toThrow(EventValidationError);

      expect(await countRows(ctx.pool, "tasks")).toBe(0);
    });

    test("ponta de outro usuario, apagada ou inexistente recusa o lote como conflito", async () => {
      const mine = await saved(trackedEvent(USER, "Meu"));
      const foreign = await saved(trackedEvent(OTHER_USER, "Do outro"));
      const removed = await saved(trackedEvent(USER, "Apagado"));
      await events.delete(removed.id, USER);

      const targets: Array<[string, [string, string]]> = [
        ["sucessor de outro usuario", [mine.id, foreign.id]],
        ["antecessor de outro usuario", [foreign.id, mine.id]],
        ["sucessor apagado", [mine.id, removed.id]],
        ["antecessor apagado", [removed.id, mine.id]],
        ["inexistente", [mine.id, ulid()]],
      ];
      for (const [what, pair] of targets) {
        const note = textArtifact(USER, "nasceria com o lote");
        const created = trackedEvent(USER, "Nasceria com o lote");

        await expect(
          writer.commit(
            batchOf({
              artifacts: [{ op: "create", entity: note }],
              tasks: [{ op: "create", entity: created }],
              sequence: sequence(pair),
            }),
          ),
          what,
        ).rejects.toThrow(EntityBatchConflictError);

        expect(await artifacts.findById(note.id), what).toBeNull();
        expect(await events.findById(created.id), what).toBeNull();
      }
      expect(await countRows(ctx.pool, "task_task_relation")).toBe(0);
    });

    test("o evento apagado no lote some das listas, mas a aresta continua no banco", async () => {
      const a = await saved(trackedEvent(USER, "A"));
      const b = await saved(trackedEvent(USER, "B"));
      await writer.commit(batchOf({ sequence: sequence([a.id, b.id]) }));

      await writer.commit(batchOf({ tasks: [{ op: "delete", id: a.id, expectedRevision: 1 }] }));

      expect((await events.findById(b.id))?.previousIds).toEqual([]);
      expect(await countRows(ctx.pool, "task_task_relation", "relation = 'precedes'")).toBe(1);
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
          tasks: [{ op: "create", entity: created }],
          afterWrite: async (transaction) => {
            const tx = transaction as Tx;
            seenInsideTransaction = (await tx.execute(sql`SELECT 1 FROM tasks WHERE id = ${created.id}`)).rows.length;
            seenOutsideTransaction = await countRows(ctx.pool, "tasks");
            await insertAgentEvent(tx, { id: stepId, userId: USER, kind: "step", status: "done", name: "Passo", data: {} });
            await tx.insert(schema.eventEventRelation).values({ fromEventId: stepId, toEventId: created.id, relation: "generates" });
          },
        }),
      );

      expect(seenInsideTransaction).toBe(1);
      expect(seenOutsideTransaction).toBe(0);
      expect(await selectRows(ctx.pool, "SELECT from_task_id, to_task_id, relation FROM task_task_relation")).toEqual([
        { from_task_id: stepId, to_task_id: created.id, relation: "generates" },
      ]);
    });

    test("se ele falha, nada do lote fica", async () => {
      const origin = await saved(trackedEvent(USER, "Origem"));
      const note = textArtifact(USER, "nasceria com o lote");

      await expect(
        writer.commit(
          batchOf({
            artifacts: [{ op: "create", entity: note }],
            tasks: [
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
      expect(await countRows(ctx.pool, "tasks")).toBe(1);
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
      (await selectRows(ctx.pool, "SELECT id FROM tasks ORDER BY started_at")).map((row) => row.id);

    test("a serie nova entra antes da primeira ocorrencia que o lote traz", async () => {
      const recurrence = dailyRecurrence(USER, DAYS[0]);
      const first = occurrenceOf(recurrence, DAYS[0]);

      await writer.commit(batchOf({ recurrences: [recurrence], tasks: [{ op: "create", entity: first }] }));

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
            tasks: [occurrenceOf(recurrence, DAYS[0]), occurrenceOf(recurrence, DAYS[0])].map((entity) => ({
              op: "create" as const,
              entity,
            })),
          }),
        ),
      ).rejects.toThrow(EntityBatchConflictError);

      expect(await recurrences.findById(recurrence.id)).toBeNull();
      expect(await countRows(ctx.pool, "tasks")).toBe(0);
    });

    test("a serie editada libera os dias de fromDay em diante para a primeira ocorrencia nova", async () => {
      const { recurrence, occurrences } = await seriesWithOccurrences();
      const revised = recurrence.revise({ rule: { timeOfDay: "19:00" }, template: { name: "Serie nova", kind: "common" } });
      const replacement = occurrenceOf(revised, DAYS[1]);

      await writer.commit(
        batchOf({
          recurrenceChanges: [{ op: "update", recurrence: revised, expectedRevision: 1, fromDay: DAYS[1] }],
          tasks: [{ op: "create", entity: replacement }],
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

      await jobContext.run(current, () => writer.commit(batchOf({ tasks: [{ op: "create", entity: created }] })));

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
                tasks: [{ op: "update", entity: origin.revise({ name: "Nao deveria mudar" }), expectedRevision: 1 }],
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

      await writer.commit(batchOf({ tasks: [{ op: "create", entity: trackedEvent(USER, "Sem job") }] }));

      expect(await store.get(current.id)).toMatchObject({ status: "running" });
    });
  });
});
