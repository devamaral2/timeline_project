import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeApi, type FakeApi } from "@/test/fake-api";
import { artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { eventFixture, eventsArea } from "@/test/fake-api/events";
import { ApiRequestError } from "./client-request";
import {
  createArtifact,
  deleteArtifact,
  editArtifact,
  getArtifact,
  listArtifacts,
  newIdempotencyKey,
} from "./artifacts";

// A tela troca o authedFetch pela API falsa: a costura que os testes de tela usam.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

type Seed = Parameters<typeof createFakeApi>[0]["seed"];

let api: FakeApi;

function install(seed: Seed = {}) {
  api = createFakeApi({ areas: [artifactsArea, eventsArea], seed });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => install());

const FOOD = {
  description: "Arroz e feijão",
  items: [],
  totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 },
  generation: { status: "completed" },
};
const WORKOUT = { code: "weightlifting", category: "strength", active: true };

describe("lista", () => {
  test("não devolve as cópias derivadas, e ordena do editado mais recentemente para o mais antigo", async () => {
    install({
      artifacts: [
        artifactFixture({ id: "art-1", name: "Nota de compras", updatedAt: "2026-09-10T10:00:00.000Z" }),
        artifactFixture({ id: "art-2", name: "Ideias", updatedAt: "2026-09-12T10:00:00.000Z" }),
        artifactFixture({ id: "art-copia", name: "Arroz (cópia)", type: "food", data: FOOD, derived: true }),
      ],
    });

    const artifacts = await listArtifacts();

    expect(artifacts.map((artifact) => artifact.id)).toEqual(["art-2", "art-1"]);
    expect(api.calls[0]).toMatchObject({ method: "GET", pathname: "/api/artifacts" });
  });

  test("manda tipo, tag, q e evento na consulta, e filtra por eles", async () => {
    install({
      events: [eventFixture({ id: "ev-1", name: "Almoço" })],
      artifacts: [
        artifactFixture({ id: "art-texto", name: "Lista", tags: ["casa"], data: { body: "Comprar leite" }, links: [{ eventId: "ev-1", relation: "uses" }] }),
        artifactFixture({ id: "art-outro", name: "Lista de treino", tags: ["casa"], data: { body: "Supino" } }),
        artifactFixture({ id: "art-sono", name: "Sono", type: "sleep", data: { trackedSleepTime: 7, score: 80 }, tags: ["casa"] }),
      ],
    });

    const found = await listArtifacts({ type: "text", tag: "casa", q: "leite", eventId: "ev-1" });

    expect(api.calls[0].query).toEqual({ type: "text", tag: "casa", q: "leite", eventId: "ev-1" });
    expect(found.map((artifact) => artifact.id)).toEqual(["art-texto"]);
  });

  test("scope=global com tipo devolve só os globais daquele tipo, por nome, sem eventos", async () => {
    install({
      artifacts: [
        artifactFixture({ id: "art-feijao", name: "Feijão", type: "food", data: FOOD, global: true }),
        artifactFixture({ id: "art-arroz", name: "Arroz", type: "food", data: FOOD, global: true }),
        artifactFixture({ id: "art-supino", name: "Supino", type: "workout", data: WORKOUT, global: true }),
        artifactFixture({ id: "art-meu", name: "Meu almoço", type: "food", data: FOOD }),
      ],
    });

    const globals = await listArtifacts({ scope: "global", type: "food" });

    expect(api.calls[0].query).toEqual({ scope: "global", type: "food" });
    expect(globals.map((artifact) => artifact.id)).toEqual(["art-arroz", "art-feijao"]);
    expect(globals.every((artifact) => artifact.tasks?.length === 0)).toBe(true);
  });

  test("scope=global sem tipo é entrada inválida", async () => {
    await expect(listArtifacts({ scope: "global" })).rejects.toMatchObject({ kind: "invalid_input" });
  });
});

describe("leitura", () => {
  test("traz os eventos em que o artefato aparece, com a relação de cada um", async () => {
    install({
      events: [eventFixture({ id: "ev-1", name: "Almoço de domingo", kind: "meal", startedAt: "2026-09-13T12:00:00-03:00" })],
      artifacts: [
        artifactFixture({ id: "art-1", name: "Almoço", type: "food", data: FOOD, links: [{ eventId: "ev-1", relation: "uses" }] }),
      ],
    });

    const artifact = await getArtifact("art-1");

    expect(artifact.tasks).toEqual([
      {
        taskId: "ev-1",
        relation: "uses",
        name: "Almoço de domingo",
        actor: "human",
        kind: "meal",
        startedAt: "2026-09-13T12:00:00-03:00",
      },
    ]);
  });

  test("um id que não existe é não encontrado", async () => {
    await expect(getArtifact("art-404")).rejects.toMatchObject({ kind: "not_found" });
  });

  test("um artefato apagado some da leitura", async () => {
    install({ artifacts: [artifactFixture({ id: "art-1", name: "Nota" })] });
    await deleteArtifact("art-1");

    await expect(getArtifact("art-1")).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe("criação", () => {
  test("envia a chave de idempotência e devolve o id do artefato criado", async () => {
    const key = newIdempotencyKey();

    const artifactId = await createArtifact({ type: "text", name: "Lembrete", data: { body: "Ligar" } }, { idempotencyKey: key });

    expect(artifactId).toBe("art-1");
    expect(api.calls[0]).toMatchObject({
      method: "POST",
      pathname: "/api/artifacts",
      idempotencyKey: key,
      body: { type: "text", name: "Lembrete", data: { body: "Ligar" } },
    });
  });

  test("a mesma chave com o mesmo corpo não cria outro artefato", async () => {
    const input = { type: "text" as const, data: { body: "Ligar" } };
    const key = newIdempotencyKey();

    const first = await createArtifact(input, { idempotencyKey: key });
    const second = await createArtifact(input, { idempotencyKey: key });

    expect(second).toBe(first);
    expect(api.store.table("artifacts").size).toBe(1);
  });

  test("alimento nasce pendente, com o texto do que foi comido", async () => {
    const artifactId = await createArtifact({ type: "food", data: { inputText: "Arroz e feijão" } }, { idempotencyKey: newIdempotencyKey() });

    expect(await getArtifact(artifactId)).toMatchObject({
      type: "food",
      data: { description: "Arroz e feijão", generation: { status: "pending" } },
    });
  });

  test("aparecer num evento ao criar liga o artefato a ele e revisa o evento", async () => {
    install({ events: [eventFixture({ id: "ev-1", name: "Almoço", revision: 1 })] });

    const artifactId = await createArtifact(
      { type: "food", data: { inputText: "Arroz" }, taskIds: ["ev-1"] },
      { idempotencyKey: newIdempotencyKey() },
    );

    expect((await getArtifact(artifactId)).tasks).toEqual([expect.objectContaining({ taskId: "ev-1", relation: "creates" })]);
    expect(api.store.table<{ revision: number }>("events").get("ev-1")?.revision).toBe(2);
  });

  test("evento citado que não existe é não encontrado, e nada é criado", async () => {
    await expect(
      createArtifact({ type: "text", data: { body: "Nota" }, taskIds: ["ev-404"] }, { idempotencyKey: newIdempotencyKey() }),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(api.store.table("artifacts").size).toBe(0);
  });

  test("corpo fora do contrato quebra o teste, não chega à rede como resposta solta", async () => {
    await expect(
      createArtifact({ type: "text", data: { body: 1 } } as never, { idempotencyKey: newIdempotencyKey() }),
    ).rejects.toThrow(/Fora do contrato em POST \/api\/artifacts/);
  });
});

describe("edição", () => {
  test("manda expectedRevision e a revisão sobe a cada edição", async () => {
    install({ artifacts: [artifactFixture({ id: "art-1", name: "Nota", data: { body: "Antes" } })] });

    await editArtifact("art-1", { expectedRevision: 1, name: "Nova", type: "text", data: { body: "Depois" } });

    expect(api.calls[0]).toMatchObject({
      method: "PATCH",
      pathname: "/api/artifacts/art-1",
      body: { expectedRevision: 1, name: "Nova", type: "text", data: { body: "Depois" } },
    });
    expect(await getArtifact("art-1")).toMatchObject({ name: "Nova", revision: 2, data: { body: "Depois" } });
  });

  test("revisão desatualizada é revisão desatualizada, e nada muda", async () => {
    install({ artifacts: [artifactFixture({ id: "art-1", name: "Nota" })] });
    await editArtifact("art-1", { expectedRevision: 1, name: "Primeira" });

    await expect(editArtifact("art-1", { expectedRevision: 1, name: "Segunda" })).rejects.toMatchObject({
      kind: "stale_revision",
    });
    expect(await getArtifact("art-1")).toMatchObject({ name: "Primeira", revision: 2 });
  });

  test("trocar os eventos mantém quem fica, tira quem sai e revisa só os eventos tocados", async () => {
    install({
      events: [eventFixture({ id: "ev-1", name: "Almoço" }), eventFixture({ id: "ev-2", name: "Jantar" })],
      artifacts: [
        artifactFixture({ id: "art-1", name: "Arroz", type: "text", links: [{ eventId: "ev-1", relation: "creates" }] }),
      ],
    });

    await editArtifact("art-1", { expectedRevision: 1, taskIds: ["ev-2"] });

    expect((await getArtifact("art-1")).tasks).toEqual([expect.objectContaining({ taskId: "ev-2", relation: "uses" })]);
    expect(api.store.table<{ revision: number }>("events").get("ev-1")?.revision).toBe(2);
    expect(api.store.table<{ revision: number }>("events").get("ev-2")?.revision).toBe(2);
  });
});

describe("remoção", () => {
  test("apagar tira o artefato das listas e das leituras", async () => {
    install({
      artifacts: [artifactFixture({ id: "art-1", name: "Nota" }), artifactFixture({ id: "art-2", name: "Outra" })],
    });

    await deleteArtifact("art-1");

    expect((await listArtifacts()).map((artifact) => artifact.id)).toEqual(["art-2"]);
    await expect(getArtifact("art-1")).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("artefato global", () => {
  test("não pode ser editado nem apagado; a leitura continua valendo", async () => {
    install({
      artifacts: [artifactFixture({ id: "art-global", name: "Feijão", type: "food", data: FOOD, global: true })],
    });

    await expect(editArtifact("art-global", { expectedRevision: 1, name: "Outro" })).rejects.toMatchObject({ kind: "forbidden" });
    await expect(deleteArtifact("art-global")).rejects.toMatchObject({ kind: "forbidden" });
    expect(await getArtifact("art-global")).toMatchObject({ name: "Feijão", global: true, tasks: [] });
  });

  test("a erro de permissão é ApiRequestError, a que a tela distingue", async () => {
    install({
      artifacts: [artifactFixture({ id: "art-global", name: "Feijão", type: "food", data: FOOD, global: true })],
    });

    await expect(deleteArtifact("art-global")).rejects.toBeInstanceOf(ApiRequestError);
  });
});
