import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { expect, test } from "vitest";
import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import { FirebaseAuthGuard } from "../../auth/firebase-auth.guard";
import type { TagSuggestionDto } from "@repo/entities/contracts";
import { SuggestTagsUseCase } from "../usecases/suggest-tags.usecase";
import { TagsController } from "./tags.controller";

const actor: AuthenticatedUser = { userId: "firebase-user-1" };

class StubTagRepository {
  suggest(params: { userId: string; query: string; limit: number }): Promise<TagSuggestionDto[]> {
    return Promise.resolve([{ id: params.userId, name: params.query }]);
  }
}

test("GET /api/tags scopes the suggestion to the authenticated actor, ignoring any userId in the query", async () => {
  const controller = new TagsController(new SuggestTagsUseCase(new StubTagRepository()));

  const result = await controller.suggest(actor, "gym");

  expect(result).toEqual([{ id: "firebase-user-1", name: "gym" }]);
});

test("defaults the query to an empty string", async () => {
  const controller = new TagsController(new SuggestTagsUseCase(new StubTagRepository()));

  const result = await controller.suggest(actor, undefined);

  expect(result).toEqual([{ id: "firebase-user-1", name: "" }]);
});

test("requires FirebaseAuthGuard on suggest", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    TagsController.prototype.suggest,
  ) as unknown[] | undefined;

  expect(guards).toContain(FirebaseAuthGuard);
});
