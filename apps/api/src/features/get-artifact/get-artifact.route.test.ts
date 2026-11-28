import { expect, test } from "vitest";
import { InMemoryArtifactTaskLinkQuery } from "../../api-core/artifacts/testing/in-memory-artifact-task-link.query";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Artifact, Task } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { getArtifactRoute } from "./get-artifact.route";
import { GetArtifactUseCase } from "./get-artifact.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };
const startedAt = new Date("2026-08-17T15:00:00.000Z");

function setup(artifacts: Artifact[], tasks: Task[] = []) {
  const kit = createTasksKit({ artifacts, tasks });
  const app = createFastifyInstance();
  registerApiRoutes(
    app,
    [
      getArtifactRoute(
        new GetArtifactUseCase(kit.artifactRepository, new InMemoryArtifactTaskLinkQuery(kit.database)),
      ),
    ],
    { authInternalServiceKey: KEY, idempotencyStore: new InMemoryIdempotencyStore() },
  );
  return app;
}

function note(id = "note-1", userId: string | undefined = "auth-user-1"): Artifact {
  return Artifact.create({ id, userId, name: "Pauta", data: { body: "itens" } });
}

function task(id: string, artifactIds: string[]): Task {
  return Task.create({
    id,
    userId: "auth-user-1",
    name: id,
    startedAt,
    artifactLinks: artifactIds.map((artifactId) => ({ artifactId, relation: "creates" as const, fromRecurrence: false })),
  });
}

test("GET /api/artifacts/:artifactId devolve o artefato do dono com as tarefas em que aparece", async () => {
  const app = setup([note()], [task("t1", ["note-1"])]);

  const response = await app.inject({ method: "GET", url: "/api/artifacts/note-1", headers: session });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({
    id: "note-1",
    name: "Pauta",
    type: "text",
    tags: [],
    revision: 1,
    tasks: [{ taskId: "t1", relation: "creates", name: "t1", actor: "human", kind: "common" }],
  });
  await app.close();
});

test("GET /api/artifacts/:artifactId de artefato global traz o artefato sem tarefas, mesmo para outro usuario", async () => {
  const app = setup([
    Artifact.create({ id: "run-1", userId: undefined, type: "workout", name: "Corrida", data: { code: "running", category: "cardio" } }),
  ]);

  const response = await app.inject({
    method: "GET",
    url: "/api/artifacts/run-1",
    headers: { ...session, "x-auth-user-id": "someone-else" },
  });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({ id: "run-1", global: true, tasks: [] });
  await app.close();
});

test("GET /api/artifacts/:artifactId responde 404 quando nao existe e 403 quando e de outro usuario", async () => {
  const app = setup([note("theirs", "someone-else")]);

  const missing = await app.inject({ method: "GET", url: "/api/artifacts/missing", headers: session });
  expect(missing.statusCode).toBe(404);
  expect(JSON.parse(missing.body)).toEqual({ error: "Artifact not found" });

  const theirs = await app.inject({ method: "GET", url: "/api/artifacts/theirs", headers: session });
  expect(theirs.statusCode).toBe(403);
  await app.close();
});

test("GET /api/artifacts/:artifactId exige a identidade do gateway", async () => {
  const app = setup([note()]);

  const response = await app.inject({ method: "GET", url: "/api/artifacts/note-1" });

  expect(response.statusCode).toBe(401);
  await app.close();
});
