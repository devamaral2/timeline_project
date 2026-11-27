import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { expect, test } from "vitest";
import { InMemoryProjectQuery } from "../../api-core/projects/testing/in-memory-project.query";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { ListProjectsController } from "./list-projects.controller";
import { ListProjectsUseCase } from "./list-projects.usecase";

const actor = { userId: "auth-user-1" };

test("GET /api/projects returns the personal project of the authenticated user", async () => {
  const controller = new ListProjectsController(new ListProjectsUseCase(new InMemoryProjectQuery()));

  expect(await controller.execute(actor)).toEqual([{ id: "personal-auth-user-1", name: "diario", personal: true }]);
});

test("the route is behind the gateway identity guard", () => {
  expect(Reflect.getMetadata(GUARDS_METADATA, ListProjectsController.prototype.execute)).toContain(GatewayIdentityGuard);
});
