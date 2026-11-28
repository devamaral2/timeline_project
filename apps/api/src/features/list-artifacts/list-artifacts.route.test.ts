import { expect, test } from "vitest";
import { InMemoryArtifactTaskLinkQuery } from "../../api-core/artifacts/testing/in-memory-artifact-task-link.query";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Artifact } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { listArtifactsRoute } from "./list-artifacts.route";
import { ListArtifactsUseCase } from "./list-artifacts.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };
const totals = { totalCaloriesKcal: 100, totalProteinGrams: 1, totalCarbohydrateGrams: 20, totalFatGrams: 0, totalFiberGrams: 1 };
const foodData = (description: string) => ({ description, items: [], totals });

function stored(id: string, props: { userId?: string; type?: string; data?: unknown; tags?: string[] } = {}): Artifact {
  return Artifact.create({
    id,
    userId: "userId" in props ? props.userId : "auth-user-1",
    type: props.type ?? "text",
    data: props.data ?? { body: `corpo de ${id}` },
    tags: props.tags,
  });
}

function setup(artifacts: Artifact[]) {
  const kit = createTasksKit({ artifacts });
  const app = createFastifyInstance();
  registerApiRoutes(
    app,
    [listArtifactsRoute(new ListArtifactsUseCase(kit.artifactRepository, new InMemoryArtifactTaskLinkQuery(kit.database)))],
    { authInternalServiceKey: KEY, idempotencyStore: new InMemoryIdempotencyStore() },
  );
  return app;
}

test("GET /api/artifacts devolve os artefatos do usuario com os filtros de query", async () => {
  const app = setup([
    stored("note-1", { tags: ["casa"] }),
    stored("note-2", { data: { body: "quintal azul" } }),
    stored("theirs", { userId: "someone-else" }),
    stored("global-run", { userId: undefined, type: "workout", data: { code: "running", category: "cardio" } }),
  ]);

  const all = await app.inject({ method: "GET", url: "/api/artifacts", headers: session });
  expect(all.statusCode).toBe(200);
  expect((JSON.parse(all.body) as Array<{ id: string }>).map((artifact) => artifact.id).sort()).toEqual(["note-1", "note-2"]);

  const filtered = await app.inject({ method: "GET", url: "/api/artifacts?q=AZUL&tag=casa", headers: session });
  expect(filtered.statusCode).toBe(200);
  expect((JSON.parse(filtered.body) as Array<{ id: string }>).map((artifact) => artifact.id)).toEqual([]);

  const search = await app.inject({ method: "GET", url: "/api/artifacts?q=AZUL", headers: session });
  expect((JSON.parse(search.body) as Array<{ id: string }>).map((artifact) => artifact.id)).toEqual(["note-2"]);

  const limited = await app.inject({ method: "GET", url: "/api/artifacts?limit=1", headers: session });
  expect(JSON.parse(limited.body)).toHaveLength(1);
  await app.close();
});

test("GET /api/artifacts?scope=global lista os globais do tipo, e exige o tipo", async () => {
  const app = setup([
    stored("note-1"),
    stored("global-run", { userId: undefined, type: "workout", data: { code: "running", category: "cardio" } }),
    stored("global-banana", { userId: undefined, type: "food", data: foodData("banana") }),
  ]);

  const global = await app.inject({ method: "GET", url: "/api/artifacts?scope=global&type=workout", headers: session });
  expect(global.statusCode).toBe(200);
  expect(JSON.parse(global.body)).toEqual([
    expect.objectContaining({ id: "global-run", global: true }),
  ]);

  const withoutType = await app.inject({ method: "GET", url: "/api/artifacts?scope=global", headers: session });
  expect(withoutType.statusCode).toBe(400);
  expect(JSON.parse(withoutType.body)).toEqual({ error: "The global scope requires a type" });
  await app.close();
});

test("GET /api/artifacts recusa tipo ou limite invalidos com 400", async () => {
  const app = setup([stored("note-1")]);

  const type = await app.inject({ method: "GET", url: "/api/artifacts?type=planeta", headers: session });
  expect(type.statusCode).toBe(400);

  const limit = await app.inject({ method: "GET", url: "/api/artifacts?limit=0", headers: session });
  expect(limit.statusCode).toBe(400);
  expect(JSON.parse(limit.body)).toEqual({ error: "Invalid limit" });
  await app.close();
});
