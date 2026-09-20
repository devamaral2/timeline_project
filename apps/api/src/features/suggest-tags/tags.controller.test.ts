import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { expect, test } from "vitest";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { TagSuggestionDto } from "@repo/contracts";
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
