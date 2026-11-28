import { expect, test } from "vitest";
import type { TagSuggestionDto } from "@repo/contracts";
import { InMemoryTagRepository } from "../../api-core/tasks/testing/in-memory-tag.repository";
import { InMemoryTaskDatabase } from "../../api-core/tasks/testing/in-memory-task-database";
import { Task } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { SuggestTagsUseCase } from "./suggest-tags.usecase";
import { suggestTagsRoute } from "./suggest-tags.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };

class StubTagRepository {
  suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]> {
    return Promise.resolve([{ id: params.userId, name: params.query }]);
  }
}

function appWith(repository: StubTagRepository | InMemoryTagRepository) {
  const app = createFastifyInstance();
  registerApiRoutes(app, [suggestTagsRoute(new SuggestTagsUseCase(repository))], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return app;
}

test("GET /api/tags scopes the suggestion to the authenticated actor, ignoring any userId in the query", async () => {
  const app = appWith(new StubTagRepository());

  const response = await app.inject({ method: "GET", url: "/api/tags?query=gym&userId=someone-else", headers: session });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual([{ id: "auth-user-1", name: "gym" }]);
  await app.close();
});

test("defaults the query to an empty string", async () => {
  const app = appWith(new StubTagRepository());

  const response = await app.inject({ method: "GET", url: "/api/tags", headers: session });

  expect(JSON.parse(response.body)).toEqual([{ id: "auth-user-1", name: "" }]);
  await app.close();
});

test("requires the gateway identity and refuses the device key, like every session route", async () => {
  const app = appWith(new StubTagRepository());

  const anonymous = await app.inject({ method: "GET", url: "/api/tags?query=gym" });
  expect(anonymous.statusCode).toBe(401);
  expect(JSON.parse(anonymous.body)).toEqual({ error: "Unauthorized" });

  const device = await app.inject({
    method: "GET",
    url: "/api/tags?query=gym",
    headers: { ...session, "x-auth-permissions": "transcription:work" },
  });
  expect(device.statusCode).toBe(403);
  await app.close();
});

function tagged(userId: string, tags: string[]): Task {
  return Task.create({ userId, name: "Tarefa", status: "todo", tags });
}

test("suggests the actor's own tags that start with the query, and never another user's", async () => {
  const database = new InMemoryTaskDatabase([
    tagged("auth-user-1", ["gym", "casa"]),
    tagged("auth-user-1", ["Gymnastics", "trabalho"]),
    tagged("someone-else", ["gym-secreto"]),
  ]);
  const app = appWith(new InMemoryTagRepository(database));

  const found = await app.inject({ method: "GET", url: "/api/tags?query=gy", headers: session });
  expect((JSON.parse(found.body) as TagSuggestionDto[]).map((tag) => tag.name)).toEqual(["gym", "gymnastics"]);

  const secret = await app.inject({ method: "GET", url: "/api/tags?query=secreto", headers: session });
  expect(JSON.parse(secret.body)).toEqual([]);
  await app.close();
});

test("limits to 10 suggestions unless a positive integer limit is given", async () => {
  const tags = Array.from({ length: 12 }, (_, index) => `tag-${String(index).padStart(2, "0")}`);
  const app = appWith(new InMemoryTagRepository(new InMemoryTaskDatabase([tagged("auth-user-1", tags)])));

  const limitOf = async (limit: string | undefined): Promise<number> => {
    const url = limit === undefined ? "/api/tags?query=tag" : `/api/tags?query=tag&limit=${limit}`;
    const response = await app.inject({ method: "GET", url, headers: session });
    return (JSON.parse(response.body) as TagSuggestionDto[]).length;
  };

  expect(await limitOf(undefined)).toBe(10);
  expect(await limitOf("3")).toBe(3);
  expect(await limitOf("0")).toBe(10);
  expect(await limitOf("muitas")).toBe(10);
  await app.close();
});
