import { expect, test } from "vitest";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Artifact } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { deleteArtifactRoute } from "./delete-artifact.route";
import { DeleteArtifactUseCase } from "./delete-artifact.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };

function note(id = "note-1", userId: string | undefined = "auth-user-1"): Artifact {
  return Artifact.create({ id, userId, name: "Pauta", data: { body: "itens" } });
}

function setup(artifacts: Artifact[]) {
  const kit = createTasksKit({ artifacts });
  const app = createFastifyInstance();
  registerApiRoutes(app, [deleteArtifactRoute(new DeleteArtifactUseCase(kit.artifactRepository))], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, kit };
}

test("DELETE /api/artifacts/:artifactId apaga o artefato do dono e responde 204 sem corpo", async () => {
  const { app, kit } = setup([note()]);

  const response = await app.inject({ method: "DELETE", url: "/api/artifacts/note-1", headers: session });

  expect(response.statusCode).toBe(204);
  expect(response.body).toBe("");
  expect(await kit.artifactRepository.findById("note-1")).toBeNull();
  await app.close();
});

test("DELETE /api/artifacts/:artifactId responde 404 quando nao existe e 403 quando e de outro usuario", async () => {
  const { app } = setup([note("theirs", "someone-else")]);

  const missing = await app.inject({ method: "DELETE", url: "/api/artifacts/missing", headers: session });
  expect(missing.statusCode).toBe(404);

  const theirs = await app.inject({ method: "DELETE", url: "/api/artifacts/theirs", headers: session });
  expect(theirs.statusCode).toBe(403);
  expect(JSON.parse(theirs.body)).toEqual({ error: "Only the artifact owner can modify it" });
  await app.close();
});

test("DELETE /api/artifacts/:artifactId recusa apagar artefato de skill ou roteador", async () => {
  const skill = Artifact.create({
    id: "skill-1",
    userId: "auth-user-1",
    type: "skill",
    name: "Agenda",
    data: { path: "hermes/skills/agenda/SKILL.md", hash: "a".repeat(64), missing: false },
  });
  const { app } = setup([skill]);

  const response = await app.inject({ method: "DELETE", url: "/api/artifacts/skill-1", headers: session });

  expect(response.statusCode).toBe(400);
  expect(JSON.parse(response.body)).toEqual({
    error: "Skill and agent artifacts follow the files and cannot be deleted",
  });
  await app.close();
});
