import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { expect, test } from "vitest";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { TagSuggestionDto } from "@repo/contracts";
import { Event } from "../../domain";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryTagRepository } from "../../api-core/events/testing/in-memory-tag.repository";
import { SuggestTagsUseCase } from "./suggest-tags.usecase";
import { SuggestTagsController } from "./suggest-tags.controller";

const actor: AuthenticatedUser = { userId: "auth-user-1" };

class StubTagRepository {
  suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]> {
    return Promise.resolve([{ id: params.userId, name: params.query }]);
  }
}

test("GET /api/tags scopes the suggestion to the authenticated actor, ignoring any userId in the query", async () => {
  const controller = new SuggestTagsController(new SuggestTagsUseCase(new StubTagRepository()));

  const result = await controller.execute(actor, "gym");

  expect(result).toEqual([{ id: "auth-user-1", name: "gym" }]);
});

test("defaults the query to an empty string", async () => {
  const controller = new SuggestTagsController(new SuggestTagsUseCase(new StubTagRepository()));

  const result = await controller.execute(actor, undefined);

  expect(result).toEqual([{ id: "auth-user-1", name: "" }]);
});

test("requires GatewayIdentityGuard on suggest", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    SuggestTagsController.prototype.execute,
  ) as unknown[] | undefined;

  expect(guards).toContain(GatewayIdentityGuard);
});

function tagged(userId: string, tags: string[]): Event {
  return Event.create({ userId, name: "Evento", status: "todo", tags });
}

test("suggests the actor's own tags that start with the query, and never another user's", async () => {
  const database = new InMemoryEventDatabase([
    tagged("auth-user-1", ["gym", "casa"]),
    tagged("auth-user-1", ["Gymnastics", "trabalho"]),
    tagged("someone-else", ["gym-secreto"]),
  ]);
  const controller = new SuggestTagsController(new SuggestTagsUseCase(new InMemoryTagRepository(database)));

  expect((await controller.execute(actor, "gy")).map((tag) => tag.name)).toEqual(["gym", "gymnastics"]);
  expect(await controller.execute(actor, "secreto")).toEqual([]);
});

test("limits to 10 suggestions unless a positive integer limit is given", async () => {
  const tags = Array.from({ length: 12 }, (_, index) => `tag-${String(index).padStart(2, "0")}`);
  const controller = new SuggestTagsController(
    new SuggestTagsUseCase(new InMemoryTagRepository(new InMemoryEventDatabase([tagged("auth-user-1", tags)]))),
  );

  expect(await controller.execute(actor, "tag")).toHaveLength(10);
  expect(await controller.execute(actor, "tag", "3")).toHaveLength(3);
  expect(await controller.execute(actor, "tag", "0")).toHaveLength(10);
  expect(await controller.execute(actor, "tag", "muitas")).toHaveLength(10);
});
