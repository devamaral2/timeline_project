import "reflect-metadata";
import { GUARDS_METADATA, HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { BadRequestError } from "../../common/http-errors";
import { expect, test } from "vitest";
import { InMemoryProjectRepository } from "../../api-core/projects/testing/in-memory-project.repository";
import { ProjectNameTakenError, ProjectValidationError } from "../../domain";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CreateProjectController } from "./create-project.controller";
import { CreateProjectUseCase } from "./create-project.usecase";

const actor = { userId: "auth-user-1" };

function setup() {
  const repository = new InMemoryProjectRepository();
  return { repository, controller: new CreateProjectController(new CreateProjectUseCase(repository)) };
}

test("POST /api/projects creates the project and answers with it", async () => {
  const { controller, repository } = setup();

  const created = await controller.execute({ name: "  timeline_project " }, actor);

  expect(created).toEqual({ id: expect.any(String), name: "timeline_project", personal: false });
  expect(repository.of(actor.userId)).toEqual([created]);
});

test("a repeated name is refused whatever the case or the spaces at the ends", async () => {
  const { controller } = setup();
  await controller.execute({ name: "Braid" }, actor);

  await expect(controller.execute({ name: " braid " }, actor)).rejects.toBeInstanceOf(ProjectNameTakenError);
  await expect(controller.execute({ name: "BRAID" }, actor)).rejects.toBeInstanceOf(ProjectNameTakenError);
});

test("personal is taken from the start: nobody makes a second one", async () => {
  const { controller } = setup();

  await expect(controller.execute({ name: "Diario" }, actor)).rejects.toBeInstanceOf(ProjectNameTakenError);
});

test("the same name is free for another user", async () => {
  const { controller } = setup();
  await controller.execute({ name: "braid" }, actor);

  await expect(controller.execute({ name: "braid" }, { userId: "auth-user-2" })).resolves.toMatchObject({ name: "braid" });
});

test.each([{ name: "" }, { name: "   " }, { name: "a".repeat(61) }, { name: 7 }, {}])("an invalid name is refused: %j", async (body) => {
  const { controller } = setup();

  await expect(controller.execute(body as { name: string }, actor)).rejects.toBeInstanceOf(ProjectValidationError);
});

test("a field the contract does not know is a bad request", () => {
  const { controller } = setup();

  expect(() => controller.execute({ name: "braid", personal: true } as never, actor)).toThrow(BadRequestError);
});

test("the route answers 201 and is behind the gateway identity guard", () => {
  expect(Reflect.getMetadata(HTTP_CODE_METADATA, CreateProjectController.prototype.execute)).toBe(201);
  expect(Reflect.getMetadata(GUARDS_METADATA, CreateProjectController.prototype.execute)).toContain(GatewayIdentityGuard);
});
