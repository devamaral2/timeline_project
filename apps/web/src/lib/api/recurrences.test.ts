import type { CreateRecurrenceInput } from "@repo/contracts";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeApi, type FakeApi } from "@/test/fake-api";
import { recurrenceFixture, recurrencesArea } from "@/test/fake-api/recurrences";
import { ApiRequestError } from "./client-request";
import {
  createRecurrence,
  deleteRecurrence,
  editRecurrence,
  getRecurrence,
  listRecurrences,
  newIdempotencyKey,
} from "./recurrences";

// A tela troca o authedFetch pela API falsa: a costura que os testes de tela usam.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

type Seed = Parameters<typeof createFakeApi>[0]["seed"];

let api: FakeApi;

function install(seed: Seed = {}) {
  api = createFakeApi({ areas: [recurrencesArea], seed });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => install());

const DAILY: CreateRecurrenceInput = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "18:00",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-14",
  template: { name: "Caminhada", priority: "medium", description: "" },
};

describe("lista e leitura", () => {
  test("lista as séries do usuário", async () => {
    install({
      recurrences: [recurrenceFixture({ id: "rec-1" }), recurrenceFixture({ id: "rec-2", frequency: "weekly", byWeekday: 4 })],
    });

    const list = await listRecurrences();

    expect(list.map((recurrence) => recurrence.id)).toEqual(["rec-1", "rec-2"]);
    expect(api.calls[0]).toMatchObject({ method: "GET", pathname: "/api/recurrences" });
  });

  test("lê uma série pelo id, e um id que não existe é não encontrado", async () => {
    install({ recurrences: [recurrenceFixture({ id: "rec-1", interval: 3 })] });

    expect(await getRecurrence("rec-1")).toMatchObject({ id: "rec-1", interval: 3, revision: 1 });
    await expect(getRecurrence("rec-404")).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("criação", () => {
  test("envia a chave de idempotência e devolve o id da série criada", async () => {
    const key = newIdempotencyKey();

    const recurrenceId = await createRecurrence(DAILY, { idempotencyKey: key });

    expect(recurrenceId).toBe("rec-1");
    expect(api.calls[0]).toMatchObject({
      method: "POST",
      pathname: "/api/recurrences",
      idempotencyKey: key,
      body: DAILY,
    });
    expect(await getRecurrence("rec-1")).toMatchObject({ frequency: "daily", timeOfDay: "18:00", revision: 1 });
  });

  test("a mesma chave com o mesmo corpo não cria outra série", async () => {
    const key = newIdempotencyKey();

    const first = await createRecurrence(DAILY, { idempotencyKey: key });
    const second = await createRecurrence(DAILY, { idempotencyKey: key });

    expect(second).toBe(first);
    expect(api.store.table("recurrences").size).toBe(1);
  });

  test("regra que a API recusa é entrada inválida, e nada é criado", async () => {
    // Semanal sem dia da semana: o esquema aceita, a regra não.
    await expect(
      createRecurrence({ ...DAILY, frequency: "weekly" }, { idempotencyKey: newIdempotencyKey() }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    expect(api.store.table("recurrences").size).toBe(0);
  });

  test("corpo fora do contrato quebra o teste, não chega à rede como resposta solta", async () => {
    await expect(
      createRecurrence({ ...DAILY, frequency: "hourly" } as never, { idempotencyKey: newIdempotencyKey() }),
    ).rejects.toThrow(/Fora do contrato em POST \/api\/recurrences/);
  });
});

describe("edição", () => {
  test("manda expectedRevision e só os campos que mudam, e a revisão sobe", async () => {
    install({ recurrences: [recurrenceFixture({ id: "rec-1" })] });

    await editRecurrence("rec-1", { expectedRevision: 1, interval: 2 });

    expect(api.calls[0]).toMatchObject({ method: "PATCH", pathname: "/api/recurrences/rec-1" });
    expect(api.calls[0].body).toEqual({ expectedRevision: 1, interval: 2 });
    expect(await getRecurrence("rec-1")).toMatchObject({ interval: 2, frequency: "daily", revision: 2 });
  });

  test("troca o template inteiro quando ele vem no corpo", async () => {
    install({ recurrences: [recurrenceFixture({ id: "rec-1" })] });

    await editRecurrence("rec-1", { expectedRevision: 1, template: { name: "Corrida", priority: "high", description: "" } });

    expect(await getRecurrence("rec-1")).toMatchObject({ template: { name: "Corrida", priority: "high" } });
  });

  test("revisão desatualizada é revisão desatualizada, e nada muda", async () => {
    install({ recurrences: [recurrenceFixture({ id: "rec-1" })] });
    await editRecurrence("rec-1", { expectedRevision: 1, interval: 2 });

    await expect(editRecurrence("rec-1", { expectedRevision: 1, interval: 5 })).rejects.toMatchObject({
      kind: "stale_revision",
    });
    expect(await getRecurrence("rec-1")).toMatchObject({ interval: 2, revision: 2 });
  });

  test("regra inválida na edição não é gravada", async () => {
    install({ recurrences: [recurrenceFixture({ id: "rec-1" })] });

    // Mensal sem dia do mês: a regra não vale.
    await expect(editRecurrence("rec-1", { expectedRevision: 1, frequency: "monthly" })).rejects.toMatchObject({
      kind: "invalid_input",
    });
    expect(await getRecurrence("rec-1")).toMatchObject({ frequency: "daily", revision: 1 });
  });

  test("trocar de diária para mensal com o dia do mês", async () => {
    install({ recurrences: [recurrenceFixture({ id: "rec-1" })] });

    await editRecurrence("rec-1", { expectedRevision: 1, frequency: "monthly", byMonthDay: 10 });

    expect(await getRecurrence("rec-1")).toMatchObject({ frequency: "monthly", byMonthDay: 10, revision: 2 });
  });

  test("de semanal para mensal é recusado: o dia da semana guardado não sai pelo PATCH", async () => {
    // A API mescla a regra guardada com a mudança e valida o resultado; o esquema não deixa mandar `byWeekday` vazio.
    install({ recurrences: [recurrenceFixture({ id: "rec-1", frequency: "weekly", byWeekday: 4 })] });

    await expect(editRecurrence("rec-1", { expectedRevision: 1, frequency: "monthly", byMonthDay: 10 })).rejects.toMatchObject({
      kind: "invalid_input",
    });
    expect(await getRecurrence("rec-1")).toMatchObject({ frequency: "weekly", byWeekday: 4, revision: 1 });
  });

  test("editar uma série que não existe é não encontrado", async () => {
    await expect(editRecurrence("rec-404", { expectedRevision: 1, interval: 2 })).rejects.toBeInstanceOf(ApiRequestError);
    await expect(editRecurrence("rec-404", { expectedRevision: 1, interval: 2 })).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});

describe("remoção", () => {
  test("apagar tira a série das listas e das leituras", async () => {
    install({ recurrences: [recurrenceFixture({ id: "rec-1" }), recurrenceFixture({ id: "rec-2" })] });

    await deleteRecurrence("rec-1");

    expect((await listRecurrences()).map((recurrence) => recurrence.id)).toEqual(["rec-2"]);
    await expect(getRecurrence("rec-1")).rejects.toMatchObject({ kind: "not_found" });
  });

  test("apagar uma série que não existe é não encontrado", async () => {
    await expect(deleteRecurrence("rec-404")).rejects.toMatchObject({ kind: "not_found" });
  });
});
