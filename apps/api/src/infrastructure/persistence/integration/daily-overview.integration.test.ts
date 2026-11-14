import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Artifact, Event, type ArtifactLink, type EventCreateProps } from "../../../domain";
import { PostgresArtifactRepository } from "../artifacts/repositories/postgres-artifact.repository";
import { PostgresDailyOverviewQuery } from "../events/queries/postgres-daily-overview.query";
import { PostgresEventRepository } from "../events/repositories/postgres-event.repository";
import { OTHER_USER, USER, agentEvent, at, foodArtifact, referenceEvent, trackedEvent } from "../testing/fixtures";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const link = (artifactId: string, relation: ArtifactLink["relation"] = "uses"): ArtifactLink => ({
  artifactId,
  relation,
  fromRecurrence: false,
});

describe("PostgresDailyOverviewQuery", () => {
  let ctx: PostgresTestContext;
  let overview: PostgresDailyOverviewQuery;
  let events: PostgresEventRepository;
  let artifacts: PostgresArtifactRepository;

  beforeAll(async () => {
    ctx = await createPostgresTestContext();
    overview = new PostgresDailyOverviewQuery(ctx.db);
    events = new PostgresEventRepository(ctx.db);
    artifacts = new PostgresArtifactRepository(ctx.db);
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  const day = (date: string, userId = USER) => overview.get({ userId, date, timeZone: "America/Sao_Paulo" });

  async function food(name: string, kcal: number, userId = USER): Promise<Artifact> {
    const artifact = foodArtifact(userId, name, kcal);
    await artifacts.save(artifact);
    return artifact;
  }

  async function sleep(trackedSleepTime: number, score: number): Promise<Artifact> {
    const artifact = Artifact.create({ userId: USER, type: "sleep", data: { trackedSleepTime, score } });
    await artifacts.save(artifact);
    return artifact;
  }

  /** Um evento de pessoa na agenda. Os horarios sao UTC: Sao Paulo esta 3 horas atras. */
  async function event(name: string, startedAt: string, props: Partial<EventCreateProps> = {}): Promise<Event> {
    const created = referenceEvent(USER, name, startedAt, props);
    await events.save(created);
    return created;
  }

  test("um dia sem eventos volta vazio", async () => {
    expect(await day("2026-11-10")).toEqual({
      date: "2026-11-10",
      sleep: null,
      caloriesConsumed: 0,
      macros: { protein: 0, carbohydrate: 0, fat: 0 },
      mealEvents: [],
      trainingEvents: [],
    });
  });

  test("soma os alimentos que cada refeicao usa: dois alimentos num evento sao uma refeicao so", async () => {
    const [rice, beans, fruit] = [await food("Arroz", 300), await food("Feijao", 200), await food("Banana", 90)];
    const lunch = await event("Almoco", "2026-11-10T15:00:00Z", {
      kind: "meal",
      description: "em casa",
      artifactLinks: [link(rice.id), link(beans.id, "creates")],
    });
    const snack = await event("Lanche", "2026-11-10T19:00:00Z", { kind: "meal", artifactLinks: [link(fruit.id)] });

    const result = await day("2026-11-10");

    expect(result.mealEvents).toHaveLength(2);
    expect(result.mealEvents.find((meal) => meal.id === lunch.id)).toEqual({
      id: lunch.id,
      name: "Almoco",
      description: "em casa",
      startedAt: "2026-11-10T15:00:00.000Z",
      estimatedFinishAt: "2026-11-10T15:20:00.000Z",
      kcal: 500,
      protein: 50,
      carbohydrate: 100,
      fat: 25,
    });
    expect(result.mealEvents.find((meal) => meal.id === snack.id)).toMatchObject({ kcal: 90 });
    expect(result.caloriesConsumed).toBe(590);
    expect(result.macros).toEqual({ protein: 59, carbohydrate: 118, fat: 29.5 });
    expect(result.sleep).toBeNull();
    expect(result.trainingEvents).toEqual([]);
  });

  test("traz o sono mais recente do dia", async () => {
    const [nap, night] = [await sleep(40, 55), await sleep(450, 88)];
    await event("Cochilo", "2026-11-10T16:00:00Z", { kind: "sleep", artifactLinks: [link(nap.id)] });
    const last = await event("Noite", "2026-11-11T01:00:00Z", {
      kind: "sleep",
      description: "dormi cedo",
      artifactLinks: [link(night.id)],
    });

    expect((await day("2026-11-10")).sleep).toEqual({
      id: last.id,
      trackedSleepTime: 450,
      score: 88,
      description: "dormi cedo",
    });
  });

  test("traz os treinos com os exercicios, sem os ids deles", async () => {
    const training = Artifact.create({
      userId: USER,
      type: "training",
      data: {
        workouts: [
          { workoutCode: "running", workoutName: "Corrida", calories: 300, duration: 30, pace: 6, distance: 5 },
          {
            workoutCode: "weightlifting",
            workoutName: "Musculação",
            calories: 200,
            duration: 45,
            sets: [{ exercise: "Supino", repetitions: 10, weight: 40 }],
          },
        ],
        caloriesBurned: 500,
      },
    });
    await artifacts.save(training);
    const session = await event("Treino da manha", "2026-11-10T10:00:00Z", {
      kind: "training",
      artifactLinks: [link(training.id, "creates")],
    });

    const result = await day("2026-11-10");

    expect(result.trainingEvents).toEqual([
      {
        id: session.id,
        name: "Treino da manha",
        description: "",
        startedAt: "2026-11-10T10:00:00.000Z",
        estimatedFinishAt: "2026-11-10T11:30:00.000Z",
        workouts: [
          { workoutCode: "running", workoutName: "Corrida", calories: 300, duration: 30, pace: 6, distance: 5 },
          {
            workoutCode: "weightlifting",
            workoutName: "Musculação",
            calories: 200,
            duration: 45,
            sets: [expect.objectContaining({ exercise: "Supino", repetitions: 10, weight: 40 })],
          },
        ],
      },
    ]);
    expect(result.caloriesConsumed).toBe(0);
  });

  test("ignora outro usuario, eventos de agente, artefatos apagados e relacoes deletes", async () => {
    const [counted, removed, discarded, touchedByAgent] = [
      await food("Conta", 100),
      await food("Apagado", 1000),
      await food("Descartado", 2000),
      await food("Do agente", 4000),
    ];
    const meal = await event("Almoco", "2026-11-10T15:00:00Z", {
      kind: "meal",
      artifactLinks: [link(counted.id), link(removed.id), link(discarded.id, "deletes")],
    });
    await artifacts.delete(removed.id, USER);
    // O pedido ao agente que alterou um alimento no mesmo dia nao e uma refeicao.
    await events.save(agentEvent(USER, "Recalcular", { startedAt: at("2026-11-10T15:00:00Z"), artifactLinks: [link(touchedByAgent.id, "updates")] }));
    const foreignFood = await food("Do outro", 8000, OTHER_USER);
    await events.save(
      referenceEvent(OTHER_USER, "Almoco do outro", "2026-11-10T15:00:00Z", { kind: "meal", artifactLinks: [link(foreignFood.id)] }),
    );

    const result = await day("2026-11-10");

    expect(result.mealEvents.map((entry) => [entry.id, entry.kcal])).toEqual([[meal.id, 100]]);
    expect(result.caloriesConsumed).toBe(100);
    expect((await day("2026-11-10", OTHER_USER)).caloriesConsumed).toBe(8000);
  });

  test("ignora eventos apagados, longos e sem inicio", async () => {
    const [one, two, three] = [await food("Um", 100), await food("Dois", 200), await food("Tres", 400)];
    const removed = await event("Apagado", "2026-11-10T15:00:00Z", { kind: "meal", artifactLinks: [link(one.id)] });
    await events.delete(removed.id, USER);
    await events.save(
      Event.create({
        userId: USER,
        name: "Dieta do mes",
        kind: "meal",
        longRunning: true,
        startedAt: at("2026-11-10T15:00:00Z"),
        artifactLinks: [link(two.id)],
      }),
    );
    await events.save(trackedEvent(USER, "Comer melhor", { kind: "meal", artifactLinks: [link(three.id)] }));

    expect((await day("2026-11-10")).mealEvents).toEqual([]);
  });

  test("o dia e o civil de Sao Paulo, e um evento que cruza a meia-noite conta nos dois dias", async () => {
    const [late, crossing, early] = [await food("Ceia", 100), await food("Festa", 200), await food("Madrugada", 400)];
    // 23:50 de 10/11 em Sao Paulo, terminando no mesmo dia.
    await event("Ceia", "2026-11-11T02:50:00Z", {
      kind: "meal",
      estimatedFinishAt: at("2026-11-11T02:55:00Z"),
      artifactLinks: [link(late.id)],
    });
    // 23:30 de 10/11 ate 00:30 de 11/11.
    await event("Festa", "2026-11-11T02:30:00Z", {
      kind: "meal",
      estimatedFinishAt: at("2026-11-11T03:30:00Z"),
      artifactLinks: [link(crossing.id)],
    });
    // 00:10 de 11/11: em UTC ainda seria o mesmo dia da ceia.
    await event("Madrugada", "2026-11-11T03:10:00Z", { kind: "meal", artifactLinks: [link(early.id)] });

    expect((await day("2026-11-10")).caloriesConsumed).toBe(300);
    expect((await day("2026-11-11")).caloriesConsumed).toBe(600);
    expect((await day("2026-11-12")).caloriesConsumed).toBe(0);
  });
});
