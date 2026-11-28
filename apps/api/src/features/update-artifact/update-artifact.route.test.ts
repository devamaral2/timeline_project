import { expect, test } from "vitest";
import { InMemoryArtifactTaskLinkQuery } from "../../api-core/artifacts/testing/in-memory-artifact-task-link.query";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Artifact, Task } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { updateArtifactRoute } from "./update-artifact.route";
import { UpdateArtifactUseCase } from "./update-artifact.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };
const startedAt = new Date("2026-08-17T15:00:00.000Z");

function note(id = "note-1", userId: string | undefined = "auth-user-1"): Artifact {
  return Artifact.create({ id, userId, name: "Pauta", data: { body: "itens" }, tags: ["time"] });
}

function task(id: string, artifactIds: string[] = [], userId = "auth-user-1"): Task {
  return Task.create({
    id,
    userId,
    name: id,
    startedAt,
    artifactLinks: artifactIds.map((artifactId) => ({ artifactId, relation: "creates" as const, fromRecurrence: false })),
  });
}

function setup(artifacts: Artifact[], tasks: Task[] = []) {
  const kit = createTasksKit({ artifacts, tasks });
  const app = createFastifyInstance();
  registerApiRoutes(
    app,
    [
      updateArtifactRoute(
        new UpdateArtifactUseCase(
          kit.artifactRepository,
          new InMemoryArtifactTaskLinkQuery(kit.database),
          kit.artifactBuilder,
          kit.taskRepository,
          kit.batchWriter,
        ),
      ),
    ],
    { authInternalServiceKey: KEY, idempotencyStore: new InMemoryIdempotencyStore() },
  );
  return { app, kit };
}

test("PATCH /api/artifacts/:artifactId edita nome e tags e responde 204 sem corpo", async () => {
  const { app, kit } = setup([note()]);

  const response = await app.inject({
    method: "PATCH",
    url: "/api/artifacts/note-1",
    headers: session,
    payload: { expectedRevision: 1, name: "  Pauta da semana ", tags: ["Trabalho"] },
  });

  expect(response.statusCode).toBe(204);
  expect(response.body).toBe("");
  expect(response.headers["content-type"]).toBeUndefined();
  expect(await kit.artifactRepository.findById("note-1")).toMatchObject({
    name: "Pauta da semana",
    tags: ["trabalho"],
    revision: 2,
  });
  await app.close();
});

test("PATCH /api/artifacts/:artifactId troca as tarefas em que o artefato aparece", async () => {
  const { app, kit } = setup([note()], [task("t1", ["note-1"]), task("t2")]);

  const response = await app.inject({
    method: "PATCH",
    url: "/api/artifacts/note-1",
    headers: session,
    payload: { expectedRevision: 1, taskIds: ["t2"] },
  });

  expect(response.statusCode).toBe(204);
  expect(await kit.taskRepository.findById("t1")).toMatchObject({ artifactLinks: [] });
  expect(await kit.taskRepository.findById("t2")).toMatchObject({
    artifactLinks: [{ artifactId: "note-1", relation: "uses", fromRecurrence: false }],
  });
  await app.close();
});

test("PATCH /api/artifacts/:artifactId preserva 404, 403, 409 e 400", async () => {
  const { app } = setup([note("theirs", "someone-else"), note("note-1")], [task("t1")]);

  const missing = await app.inject({
    method: "PATCH",
    url: "/api/artifacts/missing",
    headers: session,
    payload: { expectedRevision: 1, name: "x" },
  });
  expect(missing.statusCode).toBe(404);

  const theirs = await app.inject({
    method: "PATCH",
    url: "/api/artifacts/theirs",
    headers: session,
    payload: { expectedRevision: 1, name: "x" },
  });
  expect(theirs.statusCode).toBe(403);

  const stale = await app.inject({
    method: "PATCH",
    url: "/api/artifacts/note-1",
    headers: session,
    payload: { expectedRevision: 7, name: "x" },
  });
  expect(stale.statusCode).toBe(409);

  const noRevision = await app.inject({
    method: "PATCH",
    url: "/api/artifacts/note-1",
    headers: session,
    payload: { name: "x" },
  });
  expect(noRevision.statusCode).toBe(400);
  expect(JSON.parse(noRevision.body)).toEqual({ error: "Invalid expectedRevision" });

  const unknownField = await app.inject({
    method: "PATCH",
    url: "/api/artifacts/note-1",
    headers: session,
    payload: { expectedRevision: 1, cor: "azul" },
  });
  expect(unknownField.statusCode).toBe(400);
  await app.close();
});

test("PATCH /api/artifacts/:artifactId recusa editar artefato de skill ou roteador", async () => {
  const skill = Artifact.create({
    id: "skill-1",
    userId: "auth-user-1",
    type: "skill",
    name: "Agenda",
    data: { path: "hermes/skills/agenda/SKILL.md", hash: "a".repeat(64), missing: false },
  });
  const { app } = setup([skill]);

  const response = await app.inject({
    method: "PATCH",
    url: "/api/artifacts/skill-1",
    headers: session,
    payload: { expectedRevision: 1, name: "Outra" },
  });

  expect(response.statusCode).toBe(400);
  expect(JSON.parse(response.body)).toEqual({
    error: "Skill and agent artifacts follow the files; ask Hermes to change the file",
  });
  await app.close();
});
