import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Artifact, Event, type ArtifactLink, type EventCreateProps } from "../../../domain";
import type { AgendaQueryParams, EventCard, TrackedQueryParams } from "../../../domain/ports";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresEventCardQuery } from "../events/queries/postgres-event-card.query";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { PostgresRecurrenceRepository } from "../recurrences/repositories/postgres-recurrence.repository";
import {
  OTHER_USER,
  USER,
  agentEvent,
  at,
  dailyRecurrence,
  foodArtifact,
  occurrenceOf,
  referenceEvent,
  textArtifact,
  trackedEvent,
} from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const uses = (artifactId: string): ArtifactLink => ({ artifactId, relation: "uses", fromRecurrence: false });
const idsOf = (cards: readonly EventCard[]) => cards.map((card) => card.event.id);

describe("PostgresEventCardQuery", () => {
  let ctx: PostgresTestContext;
  let cards: PostgresEventCardQuery;
  let events: PostgresEventRepository;
  let artifacts: PostgresArtifactRepository;
  let recurrences: PostgresRecurrenceRepository;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    cards = new PostgresEventCardQuery(ctx.db);
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

  const reference = (name: string, startedAt: string, props: Partial<EventCreateProps> = {}) =>
    saved(referenceEvent(USER, name, startedAt, props));
  const tracked = (name: string, props: Partial<EventCreateProps> = {}) => saved(trackedEvent(USER, name, props));

  describe("agenda", () => {
    const agenda = async (params: Partial<AgendaQueryParams> = {}) =>
      idsOf((await cards.agenda({ userId: USER, limit: 50, ...params })).items);

    // O dia 10 de novembro em Sao Paulo.
    const from = at("2026-11-10T03:00:00Z");
    const to = at("2026-11-11T03:00:00Z");

    test("a janela inclui quem comecou antes e ainda nao terminou, e exclui quem terminou antes ou comeca depois", async () => {
      const crossing = await reference("Vira a meia-noite", "2026-11-10T02:00:00Z", {
        estimatedFinishAt: at("2026-11-10T04:00:00Z"),
      });
      const monthLong = await reference("Bloco de 30 dias", "2026-10-11T03:00:00Z", {
        estimatedFinishAt: at("2026-11-10T05:00:00Z"),
      });
      const inside = await reference("No meio do dia", "2026-11-10T15:00:00Z");
      const atEnd = await reference("No limite", "2026-11-11T03:00:00Z");
      await reference("Terminou antes", "2026-11-10T00:00:00Z", { estimatedFinishAt: at("2026-11-10T01:00:00Z") });
      await reference("Comeca depois", "2026-11-11T04:00:00Z");

      expect(await agenda({ from, to })).toEqual([atEnd.id, inside.id, crossing.id, monthLong.id]);
      // So `to`: tudo o que comeca ate ali. So `from`: tudo o que ainda toca dali em diante.
      expect(await agenda({ to })).toHaveLength(5);
      expect(await agenda({ from })).toHaveLength(5);
      expect(await agenda()).toHaveLength(6);
    });

    test("deixa de fora eventos longos, passos, eventos sem inicio, apagados e de outro usuario", async () => {
      const referenceCard = await reference("De referencia", "2026-11-10T15:00:00Z");
      const trackedWithStart = await tracked("Acompanhado com hora", { startedAt: at("2026-11-10T14:00:00Z") });
      await saved(
        Event.create({
          userId: USER,
          name: "Evento longo",
          longRunning: true,
          startedAt: at("2026-11-10T13:00:00Z"),
          estimatedFinishAt: at("2027-01-10T13:00:00Z"),
        }),
      );
      await saved(agentEvent(USER, "Passo", { kind: "step", status: "done" }));
      await tracked("Sem inicio", { estimatedFinishAt: at("2026-11-10T20:00:00Z") });
      const removed = await reference("Apagado", "2026-11-10T16:00:00Z");
      await events.delete(removed.id, USER);
      await saved(referenceEvent(OTHER_USER, "Do outro", "2026-11-10T15:00:00Z"));

      expect(await agenda({ from, to })).toEqual([referenceCard.id, trackedWithStart.id]);
    });

    test("inclui os pedidos ao agente; sem fim planejado, vale a conclusao real", async () => {
      const running = await saved(agentEvent(USER, "Em andamento", { startedAt: at("2026-11-10T12:00:00Z") }));
      const finishedInside = await saved(
        agentEvent(USER, "Terminou dentro", {
          status: "done",
          startedAt: at("2026-11-10T02:30:00Z"),
          finishedAt: at("2026-11-10T03:30:00Z"),
        }),
      );
      await saved(agentEvent(USER, "Comecou antes e nao terminou", { startedAt: at("2026-11-10T02:00:00Z") }));
      await saved(
        agentEvent(USER, "Terminou antes", {
          status: "failed",
          startedAt: at("2026-11-10T01:00:00Z"),
          finishedAt: at("2026-11-10T01:05:00Z"),
        }),
      );

      expect(await agenda({ from, to })).toEqual([running.id, finishedInside.id]);
    });

    test("filtra por executor, tipo e tag", async () => {
      const meal = await reference("Almoco", "2026-11-10T15:00:00Z", { kind: "meal", tags: ["saude"] });
      const training = await reference("Treino", "2026-11-10T10:00:00Z", { kind: "training", tags: ["saude", "rua"] });
      const routine = await reference("Reuniao", "2026-11-10T13:00:00Z", { tags: ["trabalho"] });
      const request = await saved(agentEvent(USER, "Pedido", { kind: "search_request", startedAt: at("2026-11-10T12:00:00Z") }));
      // A mesma tag, de outro usuario, e outra tag.
      await saved(referenceEvent(OTHER_USER, "Do outro", "2026-11-10T15:00:00Z", { tags: ["saude"] }));

      expect(await agenda({ actor: "human" })).toEqual([meal.id, routine.id, training.id]);
      expect(await agenda({ actor: "agent" })).toEqual([request.id]);
      expect(await agenda({ kind: "meal" })).toEqual([meal.id]);
      expect(await agenda({ kind: "search_request" })).toEqual([request.id]);
      expect(await agenda({ tag: "saude" })).toEqual([meal.id, training.id]);
      expect(await agenda({ tag: "saude", kind: "training", actor: "human", from, to })).toEqual([training.id]);
      expect(await agenda({ tag: "inexistente" })).toEqual([]);
    });

    test("pagina do mais novo ao mais antigo, desempatando pelo id", async () => {
      const created = [
        await reference("A", "2026-11-10T10:00:00Z"),
        await reference("B", "2026-11-10T11:00:00Z"),
        await reference("C", "2026-11-10T11:00:00Z"),
        await reference("D", "2026-11-10T12:00:00Z"),
        await reference("E", "2026-11-10T09:00:00Z"),
      ];
      const expected = [...created]
        .sort(
          (left, right) =>
            (right.startedAt as Date).getTime() - (left.startedAt as Date).getTime() || (left.id < right.id ? 1 : -1),
        )
        .map((event) => event.id);

      const pages: string[][] = [];
      let cursor: string | undefined;
      do {
        const page = await cards.agenda({ userId: USER, limit: 2, cursor });
        pages.push(idsOf(page.items));
        cursor = page.nextCursor;
      } while (cursor);

      expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
      expect(pages.flat()).toEqual(expected);
      // Uma pagina que cabe tudo nao promete outra.
      expect((await cards.agenda({ userId: USER, limit: 5 })).nextCursor).toBeUndefined();
      await expect(cards.agenda({ userId: USER, limit: 2, cursor: "nao-e-um-cursor" })).rejects.toThrow(/Invalid agenda cursor/);
    });
  });

  describe("lista de tarefas", () => {
    const list = async (params: Partial<TrackedQueryParams> = {}) => idsOf(await cards.tracked({ userId: USER, ...params }));

    async function seed() {
      const timed = await tracked("Comprar LEITE", {
        startedAt: at("2026-11-10T10:00:00Z"),
        priority: "urgent",
        tags: ["casa"],
      });
      const request = await saved(agentEvent(USER, "Pedido ao agente", { startedAt: at("2026-11-11T00:00:00Z") }));
      const deadline = await tracked("Meta 100% do relatorio", {
        status: "doing",
        estimatedFinishAt: at("2026-11-12T00:00:00Z"),
        tags: ["trabalho", "casa"],
      });
      const long = await saved(
        Event.create({
          userId: USER,
          name: "Reforma",
          longRunning: true,
          priority: "high",
          estimatedFinishAt: at("2026-12-01T00:00:00Z"),
        }),
      );
      const undated = await tracked("Sem data", { status: "done" });
      return { timed, request, deadline, long, undated };
    }

    test("traz so eventos com status, com os longos e os pedidos, pela data e com os sem data no fim", async () => {
      const { timed, request, deadline, long, undated } = await seed();
      await reference("De referencia", "2026-11-10T15:00:00Z");
      await saved(agentEvent(USER, "Passo", { kind: "step", status: "done" }));
      const removed = await tracked("Apagado");
      await events.delete(removed.id, USER);
      await saved(trackedEvent(OTHER_USER, "Do outro"));

      expect(await list()).toEqual([timed.id, request.id, deadline.id, long.id, undated.id]);
    });

    test("filtra por status, prioridade, tag e executor", async () => {
      const { timed, request, deadline, long, undated } = await seed();

      expect(await list({ status: ["doing", "done"] })).toEqual([deadline.id, undated.id]);
      expect(await list({ status: ["running"] })).toEqual([request.id]);
      expect(await list({ priority: ["urgent", "high"] })).toEqual([timed.id, long.id]);
      expect(await list({ tag: "casa" })).toEqual([timed.id, deadline.id]);
      expect(await list({ actor: "agent" })).toEqual([request.id]);
      expect(await list({ actor: "human" })).toEqual([timed.id, deadline.id, long.id, undated.id]);
      // Listas vazias de status e prioridade nao filtram.
      expect(await list({ status: [], priority: [] })).toHaveLength(5);
    });

    test("busca no nome sem diferenciar maiusculas e sem tratar % e _ como curingas", async () => {
      const { timed, deadline } = await seed();
      const underscore = await tracked("arquivo_final");
      await tracked("arquivoXfinal");

      expect(await list({ q: "leite" })).toEqual([timed.id]);
      expect(await list({ q: "100%" })).toEqual([deadline.id]);
      expect(await list({ q: "%" })).toEqual([deadline.id]);
      expect(await list({ q: "arquivo_final" })).toEqual([underscore.id]);
    });

    test("a janela vale sobre o inicio ou, sem ele, sobre o prazo; sem as duas datas o evento fica de fora", async () => {
      const { timed, request, deadline, long } = await seed();

      expect(await list({ from: at("2026-11-11T00:00:00Z") })).toEqual([request.id, deadline.id, long.id]);
      expect(await list({ to: at("2026-11-11T00:00:00Z") })).toEqual([timed.id, request.id]);
      expect(await list({ from: at("2026-11-10T12:00:00Z"), to: at("2026-11-12T00:00:00Z") })).toEqual([
        request.id,
        deadline.id,
      ]);
    });

    test("separa os eventos longos e respeita o limite", async () => {
      const { timed, request, deadline, long, undated } = await seed();

      expect(await list({ longRunning: true })).toEqual([long.id]);
      expect(await list({ longRunning: false })).toEqual([timed.id, request.id, deadline.id, undated.id]);
      expect(await list({ limit: 2 })).toEqual([timed.id, request.id]);
    });

    test("uma serie aparece uma vez so, pela proxima ocorrencia em aberto", async () => {
      const recurrence = dailyRecurrence(USER, "2026-11-10", { status: "todo" });
      await recurrences.save(recurrence);
      const [first, second, third] = [
        await saved(occurrenceOf(recurrence, "2026-11-10", { status: "todo" })),
        await saved(occurrenceOf(recurrence, "2026-11-11", { status: "todo" })),
        await saved(occurrenceOf(recurrence, "2026-11-12", { status: "todo" })),
      ];
      const loose = await tracked("Fora de serie", { startedAt: at("2026-11-09T12:00:00Z") });

      expect(await list()).toEqual([loose.id, first.id]);

      // Concluir e uma edicao: a ocorrencia se destaca, aparece por si e a vez passa para a seguinte.
      await events.update(first.revise({ status: "done" }), USER, 1);
      expect(await list()).toEqual([loose.id, first.id, second.id]);
      expect(await list({ status: ["todo"] })).toEqual([loose.id, second.id]);

      // Apagar a proxima passa a vez de novo.
      await events.delete(second.id, USER);
      expect(await list()).toEqual([loose.id, first.id, third.id]);
    });

    test("a ocorrencia destacada aparece por si, ao lado da proxima da serie", async () => {
      const recurrence = dailyRecurrence(USER, "2026-11-10", { status: "todo" });
      await recurrences.save(recurrence);
      const first = await saved(occurrenceOf(recurrence, "2026-11-10", { status: "todo" }));
      const second = await saved(occurrenceOf(recurrence, "2026-11-11", { status: "todo" }));
      const third = await saved(occurrenceOf(recurrence, "2026-11-12", { status: "todo" }));

      await events.update(third.revise({ name: "So neste dia" }), USER, 1);

      expect(await list()).toEqual([first.id, third.id]);
      expect(await list({ q: "so neste" })).toEqual([third.id]);
      expect(second.occurrence?.detached).toBe(false);
    });

    test("uma serie sem ocorrencia em aberto nao aparece", async () => {
      const recurrence = dailyRecurrence(USER, "2026-11-10", { status: "todo" });
      await recurrences.save(recurrence);
      await saved(occurrenceOf(recurrence, "2026-11-10", { status: "cancel" }));
      await saved(occurrenceOf(recurrence, "2026-11-11", { status: "done" }));

      expect(await list()).toEqual([]);
    });
  });

  describe("sequencia", () => {
    test("o evento do cartao traz previousIds e nextIds, sem os eventos apagados", async () => {
      const [before, middle, after, removed, removedNext] = [
        await tracked("Antes"),
        await tracked("Meio"),
        await tracked("Depois"),
        await tracked("Apagado antes"),
        await tracked("Apagado depois"),
      ];
      await new PostgresEntityBatchWriter(ctx.db).commit({
        userId: USER,
        events: [],
        artifacts: [],
        sequence: [
          { op: "add", fromId: before.id, toId: middle.id },
          { op: "add", fromId: middle.id, toId: after.id },
          { op: "add", fromId: removed.id, toId: middle.id },
          { op: "add", fromId: middle.id, toId: removedNext.id },
        ],
      });
      await events.delete(removed.id, USER);
      await events.delete(removedNext.id, USER);

      const found = await cards.cardsOf([before.id, middle.id, after.id]);

      expect(found.find((card) => card.event.id === middle.id)?.event).toMatchObject({
        previousIds: [before.id],
        nextIds: [after.id],
        revision: 1,
      });
      expect(found.find((card) => card.event.id === before.id)?.event).toMatchObject({ previousIds: [], nextIds: [middle.id] });
      expect(found.find((card) => card.event.id === after.id)?.event).toMatchObject({ previousIds: [middle.id], nextIds: [] });
    });
  });

  describe("o cartao", () => {
    test("leva os tipos dos artefatos na ordem do evento, sem os apagados", async () => {
      const note = textArtifact(USER, "nota");
      const food = foodArtifact(USER, "Marmita", 500);
      const sleep = Artifact.create({ userId: USER, type: "sleep", data: { trackedSleepTime: 400, score: 70 } });
      const removed = textArtifact(USER, "apagada");
      for (const artifact of [note, food, sleep, removed]) await artifacts.save(artifact);
      const event = await reference("Dia cheio", "2026-11-10T15:00:00Z", {
        artifactLinks: [uses(food.id), uses(removed.id), uses(note.id), uses(sleep.id)],
        tags: ["casa"],
      });
      const plain = await reference("Sem artefato", "2026-11-10T16:00:00Z");
      await artifacts.delete(removed.id, USER);

      const { items } = await cards.agenda({ userId: USER, limit: 10 });

      expect(items.map((card) => [card.event.id, card.artifactTypes])).toEqual([
        [plain.id, []],
        [event.id, ["food", "text", "sleep"]],
      ]);
      expect(items[1].event.tags).toEqual(["casa"]);
      expect(items[1].event.artifactLinks.map((link) => link.artifactId)).toEqual([food.id, note.id, sleep.id]);
      expect(items.every((card) => card.recurrence === undefined)).toBe(true);
    });

    test("leva a regra da serie quando o evento e uma ocorrencia, destacada ou nao", async () => {
      const recurrence = dailyRecurrence(USER, "2026-11-10");
      await recurrences.save(recurrence);
      const attached = await saved(occurrenceOf(recurrence, "2026-11-10"));
      const detached = await saved(occurrenceOf(recurrence, "2026-11-11"));
      await events.update(detached.revise({ name: "Editada" }), USER, 1);
      const loose = await reference("Fora de serie", "2026-11-12T12:00:00Z");

      const found = await cards.cardsOf([loose.id, detached.id, attached.id]);

      expect(found.map((card) => [card.event.id, card.recurrence?.id])).toEqual([
        [loose.id, undefined],
        [detached.id, recurrence.id],
        [attached.id, recurrence.id],
      ]);
      expect(found[2].recurrence?.rule).toEqual(recurrence.rule);
    });

    test("cardsOf devolve os eventos vivos na ordem dos ids pedidos", async () => {
      const [a, b, removed] = [await tracked("A"), await tracked("B"), await tracked("Apagado")];
      await events.delete(removed.id, USER);

      expect(idsOf(await cards.cardsOf([b.id, removed.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV", a.id]))).toEqual([b.id, a.id]);
      expect(await cards.cardsOf([])).toEqual([]);
    });
  });
});
