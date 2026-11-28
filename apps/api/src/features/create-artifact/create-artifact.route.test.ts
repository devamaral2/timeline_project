import { expect, test } from "vitest";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Task } from "../../domain";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { createArtifactRoute } from "./create-artifact.route";
import { CreateArtifactUseCase } from "./create-artifact.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };

function setup(tasks: Task[] = []) {
  const kit = createTasksKit({ tasks });
  const app = createFastifyInstance();
  registerApiRoutes(
    app,
    [createArtifactRoute(new CreateArtifactUseCase(kit.artifactBuilder, kit.taskRepository, kit.batchWriter))],
    { authInternalServiceKey: KEY, idempotencyStore: new InMemoryIdempotencyStore() },
  );
  return { app, kit };
}

function task(id: string, userId = "auth-user-1"): Task {
  return Task.create({ id, userId, name: id, startedAt: new Date("2026-08-17T15:00:00.000Z") });
}

test("POST /api/artifacts cria o artefato do usuario e responde 201 com o id", async () => {
  const { app, kit } = setup([task("t1")]);

  const response = await app.inject({
    method: "POST",
    url: "/api/artifacts",
    headers: session,
    payload: { data: { body: "Ideias\npara o quintal" }, tags: ["Casa"], taskIds: ["t1"] },
  });

  expect(response.statusCode).toBe(201);
  const { artifactId } = JSON.parse(response.body) as { artifactId: string };
  expect(await kit.artifactRepository.findById(artifactId)).toMatchObject({ type: "text", name: "Ideias", tags: ["casa"] });
  expect(await kit.taskRepository.findById("t1")).toMatchObject({
    artifactLinks: [{ artifactId, relation: "creates", fromRecurrence: false }],
  });
  await app.close();
});

test("POST /api/artifacts preserva a idempotencia da criacao", async () => {
  const { app, kit } = setup();
  const body = { data: { body: "repetido" } };
  const headers = { ...session, "idempotency-key": "criar-artefato" };

  const first = await app.inject({ method: "POST", url: "/api/artifacts", headers, payload: body });
  expect(first.statusCode).toBe(201);
  const { artifactId } = JSON.parse(first.body) as { artifactId: string };

  const replay = await app.inject({ method: "POST", url: "/api/artifacts", headers, payload: body });
  expect(replay.statusCode).toBe(201);
  expect(replay.headers["idempotent-replayed"]).toBe("true");
  expect(JSON.parse(replay.body)).toEqual({ artifactId });
  expect(kit.database.artifacts).toHaveLength(1);

  const mismatch = await app.inject({
    method: "POST",
    url: "/api/artifacts",
    headers,
    payload: { data: { body: "outro" } },
  });
  expect(mismatch.statusCode).toBe(422);
  await app.close();
});

test("POST /api/artifacts recusa corpo invalido e tarefa que nao e do usuario", async () => {
  const { app } = setup([task("theirs", "someone-else")]);

  const badType = await app.inject({ method: "POST", url: "/api/artifacts", headers: session, payload: { type: "planeta" } });
  expect(badType.statusCode).toBe(400);

  const unknownField = await app.inject({
    method: "POST",
    url: "/api/artifacts",
    headers: session,
    payload: { data: { body: "x" }, cor: "azul" },
  });
  expect(unknownField.statusCode).toBe(400);

  const missingData = await app.inject({ method: "POST", url: "/api/artifacts", headers: session, payload: { type: "food" } });
  // A linha de base tambem responde 500 aqui: o `data` ausente do alimento quebra antes da validacao do dominio.
  expect(missingData.statusCode).toBe(500);

  const theirs = await app.inject({
    method: "POST",
    url: "/api/artifacts",
    headers: session,
    payload: { data: { body: "x" }, taskIds: ["theirs"] },
  });
  expect(theirs.statusCode).toBe(403);
  await app.close();
});
