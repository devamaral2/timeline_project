import { expect, test } from "vitest";
import { createFakeApi } from ".";
import { eventFixture, eventsArea } from "./events";

const ROTA_ANTIGA = "/api/events"; // a rota antiga: a API falsa não a conhece mais

test("a API falsa recusa um corpo que o contrato não aceita, e o teste falha", async () => {
  const api = createFakeApi({ areas: [eventsArea] });

  await expect(
    api.authedFetch("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ name: "Caminhada", status: "inventado" }),
      headers: { "Content-Type": "application/json" },
    }),
  ).rejects.toThrow(/Fora do contrato em POST \/api\/tasks; corpo recebido/);
});

test("a API falsa recusa uma resposta que o contrato não aceita, e o teste falha", async () => {
  // Fora do tipo de propósito: o seed não é conferido, a resposta é.
  const withExtraField = { ...eventFixture({ id: "ev-1" }), campoInventado: true };
  const api = createFakeApi({ areas: [eventsArea], seed: { events: [withExtraField] } });

  await expect(api.authedFetch("/api/tasks/ev-1")).rejects.toThrow(/Fora do contrato em GET \/api\/tasks\/:taskId; resposta devolvida/);
});

test("uma rota que nenhuma área declara é erro de teste, com a dica de qual área incluir", async () => {
  const api = createFakeApi({ areas: [eventsArea] });

  await expect(api.authedFetch("/api/artifacts")).rejects.toThrow(/inclua a área certa em `areas`/);
});

test("a mesma chave de idempotência devolve a primeira resposta sem criar outro evento", async () => {
  const api = createFakeApi({ areas: [eventsArea] });
  const send = (name: string) =>
    api.authedFetch("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ name }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": "form-1" },
    });

  const first = await send("Caminhada");
  const second = await send("Caminhada");

  expect(second).toEqual(first);
  expect(api.store.table("events").size).toBe(1);
});

test("a mesma chave com outro corpo responde 422", async () => {
  const api = createFakeApi({ areas: [eventsArea] });
  const send = (name: string) =>
    api.authedFetch("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ name }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": "form-1" },
    });
  await send("Caminhada");

  await expect(send("Corrida")).rejects.toMatchObject({ status: 422 });
});

test("a revisão sobe a cada edição, e uma edição com revisão antiga responde 409", async () => {
  const api = createFakeApi({ areas: [eventsArea], seed: { events: [eventFixture({ id: "ev-1" })] } });
  const patch = (expectedRevision: number) =>
    api.authedFetch("/api/tasks/ev-1", {
      method: "PATCH",
      body: JSON.stringify({ expectedRevision, name: "Nova" }),
      headers: { "Content-Type": "application/json" },
    });

  await patch(1);
  await expect(patch(1)).rejects.toMatchObject({ status: 409 });
  expect(api.store.table<{ revision: number }>("events").get("ev-1")?.revision).toBe(2);
});

test("failNext responde o status pedido uma vez, sem executar a rota", async () => {
  const api = createFakeApi({ areas: [eventsArea], seed: { events: [eventFixture({ id: "ev-1" })] } });
  api.failNext("DELETE", "/api/tasks/ev-1", 403);

  await expect(api.authedFetch("/api/tasks/ev-1", { method: "DELETE" })).rejects.toMatchObject({ status: 403 });
  await expect(api.authedFetch("/api/tasks/ev-1", { method: "DELETE" })).resolves.toBeUndefined();
});

test("a rota antiga não existe na API falsa: só /api/tasks responde", async () => {
  const api = createFakeApi({ areas: [eventsArea] });

  await expect(api.authedFetch(ROTA_ANTIGA)).rejects.toThrow(/inclua a área certa em `areas`/);
  await expect(api.authedFetch(`${ROTA_ANTIGA}/ev-1`)).rejects.toThrow(/inclua a área certa em `areas`/);
});
