import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  Artifact,
  Event,
  EventNotFoundError,
  EventOwnershipError,
  EventRevisionConflictError,
  EventValidationError,
  type ArtifactLink,
} from "../../../domain";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresTagRepository } from "../events/repositories/postgres-tag.repository";
import { PostgresRecurrenceRepository } from "../recurrences/repositories/postgres-recurrence.repository";
import {
  GLOBAL_WORKOUT_ID,
  OTHER_USER,
  USER,
  agentEvent,
  at,
  countRows,
  dailyRecurrence,
  occurrenceOf,
  pendingFoodData,
  referenceEvent,
  selectRows,
  textArtifact,
  trackedEvent,
} from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const uses = (artifactId: string, fromRecurrence = false): ArtifactLink => ({ artifactId, relation: "uses", fromRecurrence });

describe("PostgresEventRepository", () => {
  let ctx: PostgresTestContext;
  let events: PostgresEventRepository;
  let artifacts: PostgresArtifactRepository;
  let recurrences: PostgresRecurrenceRepository;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
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

  async function found(eventId: string): Promise<Event> {
    const event = await events.findById(eventId);
    if (!event) throw new Error(`Evento ${eventId} nao foi encontrado`);
    return event;
  }

  describe("gravar e ler de volta", () => {
    test("evento de referencia volta sem status, com o fim estimado e o aviso padrao", async () => {
      const event = referenceEvent(USER, "Almoco", "2026-11-10T15:00:00Z", {
        kind: "meal",
        description: "com a equipe",
        priority: "high",
      });
      await events.save(event);

      const read = await found(event.id);

      expect(read.isReference).toBe(true);
      expect(read).toMatchObject({
        id: event.id,
        userId: USER,
        actor: "human",
        kind: "meal",
        status: undefined,
        priority: "high",
        name: "Almoco",
        description: "com a equipe",
        longRunning: false,
        revision: 1,
        occurrence: undefined,
      });
      expect(read.startedAt).toEqual(at("2026-11-10T15:00:00Z"));
      // Uma refeicao sem fim declarado estima 20 minutos.
      expect(read.estimatedFinishAt).toEqual(at("2026-11-10T15:20:00Z"));
      expect(read.finishedAt).toBeUndefined();
      expect(read.notifyOffsetsMinutes).toEqual([5]);
    });

    test("evento acompanhado volta com status e prazo, sem inicio", async () => {
      const event = trackedEvent(USER, "Declarar imposto", {
        status: "doing",
        priority: "urgent",
        estimatedFinishAt: at("2026-11-30T03:00:00Z"),
        notifyOffsetsMinutes: [60, 1440],
      });
      await events.save(event);

      const read = await found(event.id);

      expect(read.isReference).toBe(false);
      expect(read.status).toBe("doing");
      expect(read.priority).toBe("urgent");
      expect(read.startedAt).toBeUndefined();
      expect(read.estimatedFinishAt).toEqual(at("2026-11-30T03:00:00Z"));
      expect(read.notifyOffsetsMinutes).toEqual([60, 1440]);
    });

    test("evento longo aceita um bloco maior que 31 dias e nasce todo", async () => {
      const event = Event.create({
        userId: USER,
        name: "Reforma da casa",
        longRunning: true,
        startedAt: at("2026-11-01T12:00:00Z"),
        estimatedFinishAt: at("2027-03-01T12:00:00Z"),
      });
      await events.save(event);

      const read = await found(event.id);

      expect(read.longRunning).toBe(true);
      expect(read.status).toBe("todo");
      expect(read.startedAt).toEqual(at("2026-11-01T12:00:00Z"));
      expect(read.estimatedFinishAt).toEqual(at("2027-03-01T12:00:00Z"));
    });

    test("evento de agente volta com o executor, o status de agente e o data", async () => {
      const event = agentEvent(USER, "Montar o cardapio da semana", {
        kind: "build_request",
        status: "waiting",
        data: { route: "steps", screen: { path: "/agenda" } },
        finishedAt: at("2026-11-10T12:05:00Z"),
      });
      await events.save(event);

      const read = await found(event.id);

      expect(read).toMatchObject({ actor: "agent", kind: "build_request", status: "waiting" });
      expect(read.data).toEqual({ route: "steps", screen: { path: "/agenda" } });
      expect(read.finishedAt).toEqual(at("2026-11-10T12:05:00Z"));
      // Evento de agente nao ganha fim estimado nem aviso.
      expect(read.estimatedFinishAt).toBeUndefined();
      expect(read.notifyOffsetsMinutes).toEqual([]);
    });

    test("findByIds deixa de fora os ids ausentes e os eventos apagados", async () => {
      const kept = await saved(trackedEvent(USER, "Fica"));
      const removed = await saved(trackedEvent(USER, "Sai"));
      await events.delete(removed.id, USER);

      const read = await events.findByIds([kept.id, removed.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV"]);

      expect(read.map((event) => event.id)).toEqual([kept.id]);
      expect(await events.findByIds([])).toEqual([]);
    });
  });

  describe("tags", () => {
    test("normaliza, grava uma tag por usuario e nome e devolve em ordem alfabetica", async () => {
      const first = await saved(trackedEvent(USER, "Correr", { tags: [" Saude ", "casa", "SAUDE"] }));
      const second = await saved(trackedEvent(USER, "Nadar", { tags: ["saude"] }));
      await saved(trackedEvent(OTHER_USER, "Do outro", { tags: ["saude"] }));

      expect((await found(first.id)).tags).toEqual(["casa", "saude"]);
      expect((await found(second.id)).tags).toEqual(["saude"]);
      // A mesma tag dos dois eventos e uma linha so; a do outro usuario e outra.
      expect(await countRows(ctx.pool, "tags", "user_id = $1", [USER])).toBe(2);
      expect(await countRows(ctx.pool, "tags", "name = 'saude'")).toBe(2);
    });

    test("editar troca as tags do evento sem apagar a tag de outros", async () => {
      const event = await saved(trackedEvent(USER, "Correr", { tags: ["saude", "casa"] }));
      const other = await saved(trackedEvent(USER, "Nadar", { tags: ["saude"] }));

      await events.update(event.revise({ tags: ["trabalho"] }), USER, 1);

      expect((await found(event.id)).tags).toEqual(["trabalho"]);
      expect((await found(other.id)).tags).toEqual(["saude"]);
    });

    test("sugere por prefixo so as tags do usuario, sem tratar % como curinga", async () => {
      await saved(trackedEvent(USER, "A", { tags: ["saude", "sabado", "casa", "100%"] }));
      await saved(trackedEvent(OTHER_USER, "B", { tags: ["samba"] }));
      const tags = new PostgresTagRepository(ctx.db);

      const suggestions = await tags.suggest({ userId: USER, query: " SA", limit: 10 });

      expect(suggestions.map((tag) => tag.name)).toEqual(["sabado", "saude"]);
      expect((await tags.suggest({ userId: USER, query: "s", limit: 1 })).map((tag) => tag.name)).toEqual(["sabado"]);
      expect((await tags.suggest({ userId: USER, query: "%", limit: 10 })).map((tag) => tag.name)).toEqual([]);
      expect((await tags.suggest({ userId: USER, query: "100%", limit: 10 })).map((tag) => tag.name)).toEqual(["100%"]);
    });
  });

  describe("relacoes com artefatos", () => {
    test("os artefatos voltam na ordem, com a relacao e a marca de serie", async () => {
      const [a, b, c] = [textArtifact(USER, "a"), textArtifact(USER, "b"), textArtifact(USER, "c")];
      for (const artifact of [a, b, c]) await artifacts.save(artifact);
      const links: ArtifactLink[] = [
        { artifactId: b.id, relation: "uses", fromRecurrence: false },
        { artifactId: a.id, relation: "creates", fromRecurrence: true },
        { artifactId: c.id, relation: "updates", fromRecurrence: false },
      ];
      const event = await saved(trackedEvent(USER, "Revisar notas", { artifactLinks: links }));

      expect((await found(event.id)).artifactLinks).toEqual(links);
      const rows = await selectRows(
        ctx.pool,
        "SELECT artifact_id, position FROM event_artifact_relation WHERE event_id = $1 ORDER BY position",
        [event.id],
      );
      expect(rows).toEqual([
        { artifact_id: b.id, position: 0 },
        { artifact_id: a.id, position: 1 },
        { artifact_id: c.id, position: 2 },
      ]);
    });

    test("reordenar, tirar e acrescentar artefatos numa edicao so", async () => {
      const [a, b, c, d] = ["a", "b", "c", "d"].map((body) => textArtifact(USER, body));
      for (const artifact of [a, b, c, d]) await artifacts.save(artifact);
      const event = await saved(trackedEvent(USER, "Revisar notas", { artifactLinks: [uses(a.id), uses(b.id), uses(c.id)] }));

      // c e a trocam de lugar, b sai e d entra: as posicoes 0 e 1 mudam de dono na mesma transacao.
      await events.update(event.revise({ artifactLinks: [uses(c.id), uses(a.id), uses(d.id)] }), USER, 1);

      expect((await found(event.id)).artifactLinks.map((link) => link.artifactId)).toEqual([c.id, a.id, d.id]);
      expect(await countRows(ctx.pool, "event_artifact_relation", "event_id = $1", [event.id])).toBe(3);
    });

    test("um artefato global pode ser ligado ao evento", async () => {
      const event = await saved(
        referenceEvent(USER, "Corrida no parque", "2026-11-10T10:00:00Z", {
          kind: "training",
          artifactLinks: [uses(GLOBAL_WORKOUT_ID)],
        }),
      );

      expect((await found(event.id)).artifactLinks).toEqual([uses(GLOBAL_WORKOUT_ID)]);
    });

    test("o artefato que nasce com o evento e gravado na mesma transacao", async () => {
      const note = textArtifact(USER, "ata da reuniao");
      const event = referenceEvent(USER, "Reuniao", "2026-11-10T13:00:00Z", {
        artifactLinks: [{ artifactId: note.id, relation: "creates", fromRecurrence: false }],
      });

      await events.save(event, { created: [note] });

      expect((await found(event.id)).artifactLinks.map((link) => link.artifactId)).toEqual([note.id]);
      expect(await artifacts.findById(note.id)).not.toBeNull();
    });

    test("se o evento e recusado, o artefato que nasceria com ele tambem nao entra", async () => {
      const food = Artifact.create({ userId: USER, type: "food", name: "Feijoada", data: pendingFoodData("feijoada") });
      const event = referenceEvent(USER, "Almoco", "2026-11-10T15:00:00Z", {
        artifactLinks: [uses(food.id), uses("01ARZ3NDEKTSV4RRFFQ69G5FAV")],
      });

      await expect(events.save(event, { created: [food] })).rejects.toThrow(EventValidationError);

      expect(await events.findById(event.id)).toBeNull();
      expect(await artifacts.findById(food.id)).toBeNull();
      // Nem o pedido de construcao do alimento, nem o job dele.
      expect(await countRows(ctx.pool, "events")).toBe(0);
      expect(await countRows(ctx.pool, "jobs")).toBe(0);
    });

    test("o artefato apagado some da lista do evento, e a relacao fica", async () => {
      const [kept, removed] = [textArtifact(USER, "fica"), textArtifact(USER, "sai")];
      for (const artifact of [kept, removed]) await artifacts.save(artifact);
      const event = await saved(trackedEvent(USER, "Evento", { artifactLinks: [uses(removed.id), uses(kept.id)] }));

      await artifacts.delete(removed.id, USER);

      expect((await found(event.id)).artifactLinks.map((link) => link.artifactId)).toEqual([kept.id]);
      expect(await countRows(ctx.pool, "event_artifact_relation", "event_id = $1", [event.id])).toBe(2);
    });
  });

  describe("subtarefas e bloqueios", () => {
    test("quem sai do evento volta em subtaskIds e blocksIds; quem chega, em parentIds e blockedByIds", async () => {
      const first = await saved(trackedEvent(USER, "Comprar tinta"));
      const second = await saved(trackedEvent(USER, "Pintar a sala"));
      const parent = await saved(trackedEvent(USER, "Reforma", { subtaskIds: [first.id, second.id] }));
      const blocker = await saved(trackedEvent(USER, "Escolher a cor", { blocksIds: [first.id] }));

      const readParent = await found(parent.id);
      expect([...readParent.subtaskIds].sort()).toEqual([first.id, second.id].sort());
      expect(readParent.parentIds).toEqual([]);
      expect((await found(blocker.id)).blocksIds).toEqual([first.id]);

      const readFirst = await found(first.id);
      expect(readFirst.parentIds).toEqual([parent.id]);
      expect(readFirst.blockedByIds).toEqual([blocker.id]);
      expect(readFirst.subtaskIds).toEqual([]);
      // A relacao pertence a origem: o destino nao e editado.
      expect(readFirst.revision).toBe(1);
      expect((await found(second.id)).blockedByIds).toEqual([]);
    });

    test("um evento pode ser subtarefa de mais de um", async () => {
      const shared = await saved(trackedEvent(USER, "Comprar tinta"));
      const one = await saved(trackedEvent(USER, "Reforma", { subtaskIds: [shared.id] }));
      const two = await saved(trackedEvent(USER, "Compras do mes", { subtaskIds: [shared.id] }));

      expect([...(await found(shared.id)).parentIds].sort()).toEqual([one.id, two.id].sort());
    });

    test("editar troca as relacoes que saem do evento e preserva as que chegam", async () => {
      const [a, b] = [await saved(trackedEvent(USER, "A")), await saved(trackedEvent(USER, "B"))];
      const middle = await saved(trackedEvent(USER, "Meio", { subtaskIds: [a.id] }));
      const top = await saved(trackedEvent(USER, "Topo", { subtaskIds: [middle.id] }));

      await events.update(middle.revise({ subtaskIds: [b.id], blocksIds: [a.id] }), USER, 1);

      const read = await found(middle.id);
      expect(read.subtaskIds).toEqual([b.id]);
      expect(read.blocksIds).toEqual([a.id]);
      expect(read.parentIds).toEqual([top.id]);
      expect((await found(a.id)).parentIds).toEqual([]);
    });

    test("subtarefa nao fecha ciclo direto", async () => {
      const child = await saved(trackedEvent(USER, "Filho"));
      await saved(trackedEvent(USER, "Pai", { subtaskIds: [child.id] }));
      const parentId = (await found(child.id)).parentIds[0] as string;

      await expect(events.update(child.revise({ subtaskIds: [parentId] }), USER, 1)).rejects.toThrow(
        /A subtask cannot contain the event it belongs to/,
      );

      // A edicao volta inteira: nem a relacao, nem a revisao.
      const read = await found(child.id);
      expect(read.subtaskIds).toEqual([]);
      expect(read.revision).toBe(1);
    });

    test("subtarefa nao fecha ciclo passando por um terceiro evento", async () => {
      const c = await saved(trackedEvent(USER, "C"));
      const b = await saved(trackedEvent(USER, "B", { subtaskIds: [c.id] }));
      const a = await saved(trackedEvent(USER, "A", { subtaskIds: [b.id] }));

      await expect(events.update(c.revise({ subtaskIds: [a.id] }), USER, 1)).rejects.toThrow(EventValidationError);

      expect(await countRows(ctx.pool, "event_event_relation")).toBe(2);
    });

    test("bloqueio nao fecha ciclo, direto ou por um terceiro", async () => {
      const c = await saved(trackedEvent(USER, "C"));
      const b = await saved(trackedEvent(USER, "B", { blocksIds: [c.id] }));
      const a = await saved(trackedEvent(USER, "A", { blocksIds: [b.id] }));

      await expect(events.update(b.revise({ blocksIds: [c.id, a.id] }), USER, 1)).rejects.toThrow(
        /Events cannot block each other in a cycle/,
      );
      await expect(events.update(c.revise({ blocksIds: [a.id] }), USER, 1)).rejects.toThrow(
        /Events cannot block each other in a cycle/,
      );

      expect((await found(c.id)).blocksIds).toEqual([]);
    });

    test("subtarefa e bloqueio sao grafos separados: um nao fecha o ciclo do outro", async () => {
      const child = await saved(trackedEvent(USER, "Filho"));
      const parent = await saved(trackedEvent(USER, "Pai", { subtaskIds: [child.id] }));

      await events.update(child.revise({ blocksIds: [parent.id] }), USER, 1);

      expect((await found(parent.id)).blockedByIds).toEqual([child.id]);
    });

    test("o evento apagado some das relacoes de quem aponta para ele e de quem ele aponta", async () => {
      const child = await saved(trackedEvent(USER, "Filho"));
      const sibling = await saved(trackedEvent(USER, "Irmao"));
      const parent = await saved(trackedEvent(USER, "Pai", { subtaskIds: [child.id, sibling.id] }));

      await events.delete(child.id, USER);
      expect((await found(parent.id)).subtaskIds).toEqual([sibling.id]);

      await events.delete(parent.id, USER);
      expect((await found(sibling.id)).parentIds).toEqual([]);
    });
  });

  describe("dono das pontas", () => {
    test("recusa relacao com evento de outro usuario ou apagado", async () => {
      const foreign = await saved(trackedEvent(OTHER_USER, "Do outro"));
      const removed = await saved(trackedEvent(USER, "Apagado"));
      await events.delete(removed.id, USER);

      for (const props of [
        { subtaskIds: [foreign.id] },
        { blocksIds: [foreign.id] },
        { subtaskIds: [removed.id] },
        { blocksIds: [removed.id] },
      ]) {
        const event = trackedEvent(USER, "Novo", props);
        await expect(events.save(event)).rejects.toThrow(/Related events not found/);
        expect(await events.findById(event.id)).toBeNull();
      }
    });

    test("recusa relacao com artefato de outro usuario ou apagado, tambem na edicao", async () => {
      const foreign = textArtifact(OTHER_USER, "do outro");
      const removed = textArtifact(USER, "apagado");
      for (const artifact of [foreign, removed]) await artifacts.save(artifact);
      await artifacts.delete(removed.id, USER);

      for (const artifactId of [foreign.id, removed.id]) {
        await expect(events.save(trackedEvent(USER, "Novo", { artifactLinks: [uses(artifactId)] }))).rejects.toThrow(
          /Related artifacts not found/,
        );
      }

      const event = await saved(trackedEvent(USER, "Existente"));
      await expect(events.update(event.revise({ artifactLinks: [uses(foreign.id)] }), USER, 1)).rejects.toThrow(
        /Related artifacts not found/,
      );
      expect((await found(event.id)).revision).toBe(1);
    });
  });

  describe("editar", () => {
    test("grava os campos novos e incrementa a revisao", async () => {
      const event = await saved(referenceEvent(USER, "Almoco", "2026-11-10T15:00:00Z", { kind: "meal" }));

      const revised = event.revise({
        name: "Almoco com a equipe",
        status: "done",
        priority: "low",
        startedAt: at("2026-11-10T16:00:00Z"),
        estimatedFinishAt: at("2026-11-10T17:00:00Z"),
        finishedAt: at("2026-11-10T17:10:00Z"),
        notifyOffsetsMinutes: [10, 30],
      });
      await events.update(revised, USER, 1);

      const read = await found(event.id);
      expect(read).toMatchObject({ name: "Almoco com a equipe", status: "done", priority: "low", revision: 2 });
      expect(read.startedAt).toEqual(at("2026-11-10T16:00:00Z"));
      expect(read.estimatedFinishAt).toEqual(at("2026-11-10T17:00:00Z"));
      expect(read.finishedAt).toEqual(at("2026-11-10T17:10:00Z"));
      expect(read.notifyOffsetsMinutes).toEqual([10, 30]);
    });

    test("tirar o status devolve o evento a referencia", async () => {
      const event = await saved(
        Event.create({ userId: USER, name: "Consulta", status: "todo", startedAt: at("2026-11-10T15:00:00Z") }),
      );

      await events.update(event.revise({ status: null, finishedAt: null }), USER, 1);

      expect((await found(event.id)).isReference).toBe(true);
    });

    test("revisao desatualizada e conflito", async () => {
      const event = await saved(trackedEvent(USER, "Evento"));
      await events.update(event.revise({ name: "Primeira edicao" }), USER, 1);

      await expect(events.update(event.revise({ name: "Edicao atrasada" }), USER, 1)).rejects.toThrow(
        EventRevisionConflictError,
      );
      expect((await found(event.id)).name).toBe("Primeira edicao");
    });

    test("outro usuario nao edita", async () => {
      const event = await saved(trackedEvent(USER, "Evento"));

      await expect(events.update(event.revise({ name: "Invadido" }), OTHER_USER, 1)).rejects.toThrow(EventOwnershipError);
      expect((await found(event.id)).name).toBe("Evento");
    });

    test("evento apagado conta como inexistente", async () => {
      const event = await saved(trackedEvent(USER, "Evento"));
      await events.delete(event.id, USER);

      await expect(events.update(event.revise({ name: "Tarde demais" }), USER, 1)).rejects.toThrow(EventNotFoundError);
    });

    test("evento de agente nao e editado nem apagado pelo repositorio", async () => {
      const request = await saved(agentEvent(USER, "Pedido"));
      // O dominio ja recusa `revise` num evento de agente; aqui a linha e montada a mao para chegar ao repositorio.
      const forged = Event.rehydrate({
        id: request.id,
        userId: USER,
        actor: "agent",
        kind: "request",
        status: "done",
        name: "Forjado",
        startedAt: request.startedAt,
        revision: 2,
      });

      await expect(events.update(forged, USER, 1)).rejects.toThrow(EventNotFoundError);
      await expect(events.delete(request.id, USER)).rejects.toThrow(EventNotFoundError);

      const read = await found(request.id);
      expect(read).toMatchObject({ name: "Pedido", status: "running", revision: 1 });
    });
  });

  describe("apagar", () => {
    test("o evento apagado some das leituras e a linha fica", async () => {
      const event = await saved(trackedEvent(USER, "Evento", { tags: ["casa"] }));

      await events.delete(event.id, USER);

      expect(await events.findById(event.id)).toBeNull();
      const [row] = await selectRows(ctx.pool, "SELECT deleted_at FROM events WHERE id = $1", [event.id]);
      expect(row.deleted_at).toBeInstanceOf(Date);
      await expect(events.delete(event.id, USER)).rejects.toThrow(EventNotFoundError);
    });

    test("outro usuario nao apaga", async () => {
      const event = await saved(trackedEvent(USER, "Evento"));

      await expect(events.delete(event.id, OTHER_USER)).rejects.toThrow(EventOwnershipError);
      expect(await events.findById(event.id)).not.toBeNull();
    });

    test("apagar uma ocorrencia registra a excecao do dia na serie", async () => {
      const recurrence = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(recurrence);
      const occurrence = await saved(occurrenceOf(recurrence, "2026-11-12"));
      const loose = await saved(trackedEvent(USER, "Fora de serie"));

      await events.delete(occurrence.id, USER);
      await events.delete(loose.id, USER);

      expect(await events.findById(occurrence.id)).toBeNull();
      expect(await recurrences.listExceptions(recurrence.id)).toEqual(["2026-11-12"]);
    });

    test("editar uma ocorrencia destaca-a da serie", async () => {
      const recurrence = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(recurrence);
      const occurrence = await saved(occurrenceOf(recurrence, "2026-11-12"));
      expect((await found(occurrence.id)).occurrence).toEqual({
        recurrenceId: recurrence.id,
        occurrenceOn: "2026-11-12",
        detached: false,
      });

      await events.update(occurrence.revise({ name: "So hoje" }), USER, 1);

      expect((await found(occurrence.id)).occurrence).toEqual({
        recurrenceId: recurrence.id,
        occurrenceOn: "2026-11-12",
        detached: true,
      });
    });
  });
});
