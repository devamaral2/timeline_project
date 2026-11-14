import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  Recurrence,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  type ArtifactLink,
  type Event,
} from "../../../domain";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresRecurrenceRepository } from "../recurrences/repositories/postgres-recurrence.repository";
import {
  OTHER_USER,
  USER,
  countRows,
  dailyRecurrence,
  dailyRule,
  occurrenceOf,
  selectRows,
  textArtifact,
  trackedEvent,
} from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const DAYS = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"] as const;

describe("PostgresRecurrenceRepository", () => {
  let ctx: PostgresTestContext;
  let recurrences: PostgresRecurrenceRepository;
  let events: PostgresEventRepository;
  let artifacts: PostgresArtifactRepository;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    recurrences = new PostgresRecurrenceRepository(ctx.db);
    events = new PostgresEventRepository(ctx.db);
    artifacts = new PostgresArtifactRepository(ctx.db);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  async function saved(recurrence: Recurrence = dailyRecurrence(USER, "2026-11-10")): Promise<Recurrence> {
    await recurrences.save(recurrence);
    return recurrence;
  }

  async function found(recurrenceId: string): Promise<Recurrence> {
    const recurrence = await recurrences.findById(recurrenceId);
    if (!recurrence) throw new Error(`Serie ${recurrenceId} nao foi encontrada`);
    return recurrence;
  }

  /** Gera as ocorrencias dos dias e avanca a marca d'agua ate o ultimo deles. */
  async function materialized(recurrence: Recurrence, days: readonly string[], links: ArtifactLink[] = []): Promise<Event[]> {
    const occurrences = days.map((day) => occurrenceOf(recurrence, day, { artifactLinks: links }));
    await recurrences.materialize(recurrence.materializedUntil(days.at(-1) as string), occurrences);
    return occurrences;
  }

  /** Os dias que ainda tem uma linha em `events`, com o estado do vinculo. */
  const occurrenceRows = (recurrenceId: string) =>
    selectRows<{ day: string; detached: boolean; deleted: boolean }>(
      ctx.pool,
      `SELECT occurrence_on::text AS day, recurrence_detached AS detached, deleted_at IS NOT NULL AS deleted
       FROM events WHERE recurrence_id = $1 ORDER BY occurrence_on`,
      [recurrenceId],
    );

  describe("gravar, ler e listar", () => {
    test("a regra e o template voltam como foram gravados", async () => {
      const weekly = await saved(
        Recurrence.create({
          userId: USER,
          rule: {
            frequency: "weekly",
            interval: 2,
            byWeekday: 0b0101010,
            timeOfDay: "07:30",
            durationMinutes: 45,
            timeZone: "America/Sao_Paulo",
            startsOn: "2026-11-02",
            endsOn: "2026-12-31",
          },
          template: { name: "Corrida", kind: "training", status: "todo", tags: ["saude"], artifactIds: [] },
        }),
      );
      const yearly = await saved(
        Recurrence.create({
          userId: USER,
          rule: {
            frequency: "yearly",
            interval: 1,
            byMonth: 2,
            byMonthDay: 29,
            timeOfDay: "09:00",
            timeZone: "America/Sao_Paulo",
            startsOn: "2024-02-29",
          },
          template: { name: "Aniversario" },
        }),
      );

      const read = await found(weekly.id);
      expect(read.rule).toEqual(weekly.rule);
      expect(read.template).toEqual(weekly.template);
      expect(read).toMatchObject({ userId: USER, revision: 1, materializedThrough: undefined });
      expect((await found(yearly.id)).rule).toEqual(yearly.rule);
      expect(await recurrences.findById("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBeNull();
    });

    test("os artefatos novos do template entram na mesma transacao da serie", async () => {
      const note = textArtifact(USER, "roteiro da reuniao");
      const recurrence = dailyRecurrence(USER, "2026-11-10", { artifactIds: [note.id] });

      await recurrences.save(recurrence, { created: [note] });

      expect(await artifacts.findById(note.id)).not.toBeNull();
      expect((await found(recurrence.id)).template).toMatchObject({ artifactIds: [note.id] });
    });

    test("listByUserId traz so as series do usuario, pela data de inicio", async () => {
      const later = await saved(dailyRecurrence(USER, "2026-12-01"));
      const sooner = await saved(dailyRecurrence(USER, "2026-11-01"));
      await saved(dailyRecurrence(OTHER_USER, "2026-10-01"));

      expect((await recurrences.listByUserId(USER)).map((recurrence) => recurrence.id)).toEqual([sooner.id, later.id]);
    });
  });

  describe("gerar ocorrencias", () => {
    test("insere as ocorrencias uma vez so e avanca a marca d'agua", async () => {
      const recurrence = await saved();

      const first = await materialized(recurrence, DAYS.slice(0, 3));
      // A segunda leitura monta eventos novos para os mesmos dias: o indice unico por dia os descarta.
      await materialized(recurrence, DAYS.slice(0, 3));

      const rows = await selectRows(ctx.pool, "SELECT id FROM events ORDER BY occurrence_on");
      expect(rows.map((row) => row.id)).toEqual(first.map((event) => event.id));
      expect((await found(recurrence.id)).materializedThrough).toBe("2026-11-12");
      expect((await events.findById(first[0].id))?.occurrence).toEqual({
        recurrenceId: recurrence.id,
        occurrenceOn: "2026-11-10",
        detached: false,
      });
    });

    test("uma leitura mais adiante so acrescenta os dias que faltam", async () => {
      const recurrence = await saved();
      await materialized(recurrence, DAYS.slice(0, 3));

      await materialized(recurrence, DAYS.slice(1, 5));

      expect((await occurrenceRows(recurrence.id)).map((row) => row.day)).toEqual([...DAYS]);
      expect((await found(recurrence.id)).materializedThrough).toBe("2026-11-14");
      // Avancar a marca d'agua nao conta como revisao da serie.
      expect((await found(recurrence.id)).revision).toBe(1);
    });

    test("a ocorrencia descartada nao deixa tags nem relacoes orfas", async () => {
      const recurrence = await saved();
      const note = textArtifact(USER, "nota da serie");
      await artifacts.save(note);
      const links: ArtifactLink[] = [{ artifactId: note.id, relation: "uses", fromRecurrence: true }];
      const [kept] = await materialized(recurrence, [DAYS[0]], links);

      await recurrences.materialize(recurrence.materializedUntil(DAYS[0]), [
        occurrenceOf(recurrence, DAYS[0], { artifactLinks: links, tags: ["duplicada"] }),
      ]);

      expect(await selectRows(ctx.pool, "SELECT event_id, from_recurrence FROM event_artifact_relation")).toEqual([
        { event_id: kept.id, from_recurrence: true },
      ]);
      expect(await countRows(ctx.pool, "tags")).toBe(0);
    });

    test("gravar pelo repositorio de eventos uma ocorrencia de um dia ja gerado nao duplica", async () => {
      const recurrence = await saved();
      const [kept] = await materialized(recurrence, [DAYS[0]]);

      await events.save(occurrenceOf(recurrence, DAYS[0], { name: "Duplicada" }));

      expect(await selectRows(ctx.pool, "SELECT id, name FROM events")).toEqual([{ id: kept.id, name: "Serie" }]);
    });

    test("se a regra mudou no meio do caminho, nada e gerado e a marca d'agua nao avanca", async () => {
      const recurrence = await saved();
      await recurrences.update(recurrence.revise({ rule: { timeOfDay: "19:00" } }), USER, 1, DAYS[0]);

      await expect(materialized(recurrence, DAYS.slice(0, 3))).rejects.toThrow(RecurrenceRevisionConflictError);

      expect(await countRows(ctx.pool, "events")).toBe(0);
      expect((await found(recurrence.id)).materializedThrough).toBeUndefined();
    });

    test("parentIds liga cada ocorrencia como subtarefa, sem editar o evento maior", async () => {
      const recurrence = await saved();
      const parent = trackedEvent(USER, "Projeto");
      await events.save(parent);
      const occurrences = DAYS.slice(0, 2).map((day) => occurrenceOf(recurrence, day));

      await recurrences.materialize(recurrence.materializedUntil(DAYS[1]), occurrences, [parent.id]);

      const readParent = await events.findById(parent.id);
      expect([...(readParent?.subtaskIds ?? [])].sort()).toEqual(occurrences.map((event) => event.id).sort());
      expect(readParent?.revision).toBe(1);
      expect((await events.findById(occurrences[0].id))?.parentIds).toEqual([parent.id]);

      // A segunda leitura nao repete a relacao das ocorrencias que ja existem.
      await recurrences.materialize(
        recurrence.materializedUntil(DAYS[2]),
        DAYS.slice(0, 3).map((day) => occurrenceOf(recurrence, day)),
        [parent.id],
      );
      expect(await countRows(ctx.pool, "event_event_relation", "relation = 'subtask'")).toBe(3);
    });

    test("com o evento maior apagado, ou de outro usuario, o lote nao insere nada", async () => {
      const recurrence = await saved();
      const removed = trackedEvent(USER, "Projeto apagado");
      const foreign = trackedEvent(OTHER_USER, "Projeto do outro");
      const alive = trackedEvent(USER, "Projeto vivo");
      for (const event of [removed, foreign, alive]) await events.save(event);
      await events.delete(removed.id, USER);

      for (const parents of [[removed.id], [foreign.id], [alive.id, removed.id]]) {
        await recurrences.materialize(recurrence.materializedUntil(DAYS[1]), [occurrenceOf(recurrence, DAYS[0])], parents);
      }

      expect(await countRows(ctx.pool, "events", "recurrence_id IS NOT NULL")).toBe(0);
      expect(await countRows(ctx.pool, "event_event_relation")).toBe(0);
    });
  });

  describe("editar a serie", () => {
    test("grava a regra revisada, incrementa a revisao e zera a marca d'agua", async () => {
      const recurrence = await saved();
      await materialized(recurrence, DAYS.slice(0, 2));

      const revised = recurrence.revise({
        rule: { frequency: "weekly", byWeekday: 0b0000010, timeOfDay: "19:00", durationMinutes: 30 },
        template: { name: "Serie nova", kind: "routine" },
      });
      await recurrences.update(revised, USER, 1, "2026-11-20");

      const read = await found(recurrence.id);
      expect(read.rule).toEqual(revised.rule);
      expect(read.template).toEqual({ name: "Serie nova", kind: "routine" });
      expect(read).toMatchObject({ revision: 2, materializedThrough: undefined });
    });

    test("apaga as ocorrencias de fromDay em diante que ninguem destacou e guarda as destacadas e as passadas", async () => {
      const recurrence = await saved();
      const occurrences = await materialized(recurrence, DAYS);
      await events.update(occurrences[3].revise({ name: "Editada a mao" }), USER, 1);
      await events.delete(occurrences[4].id, USER);

      await recurrences.update(recurrence.revise({ rule: { timeOfDay: "19:00" } }), USER, 1, DAYS[2]);

      expect(await occurrenceRows(recurrence.id)).toEqual([
        { day: DAYS[0], detached: false, deleted: false },
        { day: DAYS[1], detached: false, deleted: false },
        { day: DAYS[3], detached: true, deleted: false },
      ]);
      // A ocorrencia apagada pelo usuario sai da tabela, mas o dia dela continua pulado.
      expect(await recurrences.listExceptions(recurrence.id)).toEqual([DAYS[4]]);
    });

    test("depois da edicao, a leitura seguinte regera os dias liberados e respeita o dia destacado", async () => {
      const recurrence = await saved();
      const occurrences = await materialized(recurrence, DAYS);
      await events.update(occurrences[3].revise({ name: "Editada a mao" }), USER, 1);
      await recurrences.update(recurrence.revise({ rule: { timeOfDay: "19:00" } }), USER, 1, DAYS[2]);

      await materialized(await found(recurrence.id), DAYS.slice(2));

      const rows = await selectRows(ctx.pool, "SELECT occurrence_on::text AS day, id, name FROM events ORDER BY occurrence_on");
      expect(rows.map((row) => row.day)).toEqual([...DAYS]);
      expect(rows[3]).toMatchObject({ id: occurrences[3].id, name: "Editada a mao" });
      expect(rows[2].id).not.toBe(occurrences[2].id);
    });

    test("revisao desatualizada e conflito, e as ocorrencias ficam", async () => {
      const recurrence = await saved();
      await materialized(recurrence, DAYS.slice(0, 2));
      await recurrences.update(recurrence.revise({ rule: { timeOfDay: "19:00" } }), USER, 1, "2026-12-01");

      await expect(recurrences.update(recurrence.revise({ rule: { timeOfDay: "20:00" } }), USER, 1, DAYS[0])).rejects.toThrow(
        RecurrenceRevisionConflictError,
      );

      expect((await found(recurrence.id)).rule.timeOfDay).toBe("19:00");
      expect(await occurrenceRows(recurrence.id)).toHaveLength(2);
    });

    test("outro usuario nao edita, e serie inexistente nao e encontrada", async () => {
      const recurrence = await saved();
      await materialized(recurrence, DAYS.slice(0, 2));
      const revised = recurrence.revise({ rule: { timeOfDay: "19:00" } });

      await expect(recurrences.update(revised, OTHER_USER, 1, DAYS[0])).rejects.toThrow(RecurrenceOwnershipError);
      await expect(
        recurrences.update(dailyRecurrence(USER, "2026-11-10").revise({ template: { name: "Fantasma" } }), USER, 1, DAYS[0]),
      ).rejects.toThrow(RecurrenceNotFoundError);

      expect((await found(recurrence.id)).revision).toBe(1);
      expect(await occurrenceRows(recurrence.id)).toHaveLength(2);
    });

    test("os artefatos novos da edicao voltam atras se a edicao e recusada", async () => {
      const recurrence = await saved();
      const note = textArtifact(USER, "nota nova do template");

      await expect(
        recurrences.update(recurrence.revise({ template: { name: "Serie", artifactIds: [note.id] } }), USER, 7, DAYS[0], {
          created: [note],
        }),
      ).rejects.toThrow(RecurrenceRevisionConflictError);

      expect(await artifacts.findById(note.id)).toBeNull();
    });
  });

  describe("apagar a serie", () => {
    test("apaga a regra e as ocorrencias de fromDay em diante; as que ficam perdem o vinculo", async () => {
      const recurrence = await saved();
      const note = textArtifact(USER, "nota da serie");
      await artifacts.save(note);
      const occurrences = await materialized(recurrence, DAYS.slice(0, 4), [
        { artifactId: note.id, relation: "uses", fromRecurrence: true },
      ]);
      // Destacada e posterior a fromDay: fica, mesmo sendo "futura".
      await events.update(occurrences[3].revise({ name: "Editada a mao" }), USER, 1);
      await recurrences.addException(recurrence.id, "2026-11-20");

      await recurrences.delete(recurrence.id, USER, DAYS[2]);

      expect(await recurrences.findById(recurrence.id)).toBeNull();
      expect(await countRows(ctx.pool, "recurrence_exceptions")).toBe(0);
      const rows = await selectRows(
        ctx.pool,
        "SELECT id, recurrence_id, occurrence_on, recurrence_detached FROM events ORDER BY started_at",
      );
      expect(rows).toEqual(
        [occurrences[0], occurrences[1], occurrences[3]].map((event) => ({
          id: event.id,
          recurrence_id: null,
          occurrence_on: null,
          recurrence_detached: false,
        })),
      );
      // A relacao herdada da serie passa a ser da propria ocorrencia.
      expect(await selectRows(ctx.pool, "SELECT DISTINCT from_recurrence FROM event_artifact_relation")).toEqual([
        { from_recurrence: false },
      ]);
      const read = await events.findById(occurrences[0].id);
      expect(read?.occurrence).toBeUndefined();
      expect(read?.artifactLinks).toEqual([{ artifactId: note.id, relation: "uses", fromRecurrence: false }]);
    });

    test("outro usuario nao apaga, e serie inexistente nao e encontrada", async () => {
      const recurrence = await saved();
      await materialized(recurrence, DAYS.slice(0, 2));

      await expect(recurrences.delete(recurrence.id, OTHER_USER, DAYS[0])).rejects.toThrow(RecurrenceOwnershipError);
      await expect(recurrences.delete("01ARZ3NDEKTSV4RRFFQ69G5FAV", USER, DAYS[0])).rejects.toThrow(RecurrenceNotFoundError);

      expect(await recurrences.findById(recurrence.id)).not.toBeNull();
      expect(await occurrenceRows(recurrence.id)).toHaveLength(2);
    });
  });

  describe("consultas de apoio", () => {
    test("findNextOccurrenceId pula as destacadas e as apagadas e respeita fromDay", async () => {
      const recurrence = await saved();
      const occurrences = await materialized(recurrence, DAYS.slice(0, 4));
      await events.delete(occurrences[0].id, USER);
      await events.update(occurrences[1].revise({ name: "Editada a mao" }), USER, 1);

      expect(await recurrences.findNextOccurrenceId(recurrence.id, DAYS[0])).toBe(occurrences[2].id);
      expect(await recurrences.findNextOccurrenceId(recurrence.id, DAYS[3])).toBe(occurrences[3].id);
      expect(await recurrences.findNextOccurrenceId(recurrence.id, DAYS[4])).toBeNull();
    });

    test("as excecoes sao por serie e pular o mesmo dia duas vezes nao falha", async () => {
      const [one, two] = [await saved(), await saved()];

      await recurrences.addException(one.id, "2026-11-12");
      await recurrences.addException(one.id, "2026-11-12");
      await recurrences.addException(one.id, "2026-11-15");
      await recurrences.addException(two.id, "2026-11-13");

      expect((await recurrences.listExceptions(one.id)).sort()).toEqual(["2026-11-12", "2026-11-15"]);
      expect(await recurrences.listExceptions(two.id)).toEqual(["2026-11-13"]);
    });

    test("listPendingMaterialization traz as series cuja marca d'agua ainda nao chegou ao horizonte", async () => {
      const untouched = await saved();
      const behind = await saved();
      const upToDate = await saved();
      const finished = await saved(Recurrence.create({ userId: USER, rule: dailyRule("2026-11-10", { endsOn: "2026-11-15" }), template: {} }));
      const finishing = await saved(Recurrence.create({ userId: USER, rule: dailyRule("2026-11-10", { endsOn: "2026-11-15" }), template: {} }));
      await saved(dailyRecurrence(OTHER_USER, "2026-11-10"));
      await recurrences.materialize(behind.materializedUntil("2026-11-20"), []);
      await recurrences.materialize(upToDate.materializedUntil("2026-11-30"), []);
      // Ja gerada ate o ultimo dia dela: nao ha mais nada a fazer, mesmo antes do horizonte.
      await recurrences.materialize(finished.materializedUntil("2026-11-15"), []);
      await recurrences.materialize(finishing.materializedUntil("2026-11-12"), []);

      const pending = await recurrences.listPendingMaterialization(USER, "2026-11-30");

      expect(pending.map((recurrence) => recurrence.id).sort()).toEqual([untouched.id, behind.id, finishing.id].sort());
      expect(pending.find((recurrence) => recurrence.id === behind.id)?.materializedThrough).toBe("2026-11-20");
    });
  });
});
