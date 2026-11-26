import { expect, test } from "vitest";
import { InMemoryTranscriptionRequests } from "../../api-core/transcription/testing/in-memory-transcription-requests";
import { TRANSCRIPTION_JOB } from "../../api-core/transcription/transcription-requests";
import { InMemoryTaskCardQuery } from "../../api-core/tasks/testing/in-memory-task-card.query";
import { InMemoryTaskRelations } from "../../api-core/tasks/testing/in-memory-task-relations";
import { createTasksKit, type TasksKitOptions } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Artifact, Task, TaskValidationError } from "../../domain";
import { DailyReadingGate } from "../save-daily-reading/daily-reading.gate";
import { RequestTranscriptionUseCase } from "./request-transcription.usecase";

const actor = { userId: "auth-user-1" };
// 17/08/2026, 12:00 em Sao Paulo.
const now = new Date("2026-08-17T15:00:00.000Z");
// 17/08/2026, 18:00 em Sao Paulo.
const sixPm = new Date("2026-08-17T21:00:00.000Z");

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const QUEUE_BODY = `Fonte: [YouTube](${VIDEO})\n\nTranscrição na fila\n`;

function setup(options: TasksKitOptions = {}) {
  const kit = createTasksKit({ ...options, clock: () => now });
  const requests = new InMemoryTranscriptionRequests(kit.database);
  const gate = new DailyReadingGate(
    new InMemoryTaskCardQuery(kit.database),
    kit.artifactRepository,
    kit.artifactBuilder,
    kit.createTask,
    kit.batchWriter,
    undefined,
    () => now,
  );
  const relations = new InMemoryTaskRelations();
  const useCase = new RequestTranscriptionUseCase(gate, requests, relations);
  return { ...kit, useCase, requests, relations };
}

function reading(overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({ id: "hoje", userId: actor.userId, name: "Leitura diária", startedAt: new Date("2026-08-17T11:00:00.000Z"), ...overrides });
}

/** A mesma tarefa de agente em outro status, como o serviço local e a entrega a deixam. */
function withStatus(task: Task, status: Task["status"], finishedAt?: Date): Task {
  return Task.rehydrate({
    ...task,
    status,
    finishedAt,
    notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
    tags: [...task.tags],
    data: { ...task.data },
    artifactLinks: [...task.artifactLinks],
    subtaskIds: [...task.subtaskIds],
    revision: task.revision + 1,
  });
}

const bodyOf = (artifact: Artifact | null) => (artifact?.data as { body?: string } | undefined)?.body;

test("sem a leitura do dia, ela nasce a fazer às 18h, com o documento na fila e o pedido aguardando, numa gravação só", async () => {
  const { useCase, taskRepository, artifactRepository, batchWriter, requests, relations } = setup();

  const result = await useCase.execute({ url: VIDEO }, actor);

  expect(result.created).toBe(true);
  expect(batchWriter.commits).toHaveLength(1);

  const readingTask = await taskRepository.findById(result.taskId);
  expect(readingTask).toMatchObject({
    userId: actor.userId,
    actor: "human",
    name: "Leitura diária",
    status: "todo",
    startedAt: sixPm,
    artifactLinks: [{ artifactId: result.artifactId, relation: "creates", fromRecurrence: false }],
  });

  const artifact = await artifactRepository.findById(result.artifactId);
  expect(artifact).toMatchObject({ userId: actor.userId, type: "text" });
  expect(bodyOf(artifact)).toBe(QUEUE_BODY);

  const request = await taskRepository.findById(result.requestId);
  expect(request).toMatchObject({
    userId: actor.userId,
    actor: "agent",
    kind: "save_content_with_transcription",
    status: "awaiting_transcription",
    startedAt: now,
    data: { url: VIDEO, day: "2026-08-17", videoId: "dQw4w9WgXcQ", readingTaskId: result.taskId, artifactId: result.artifactId },
    artifactLinks: [{ artifactId: result.artifactId, relation: "creates", fromRecurrence: false }],
  });
  expect(request?.finishedAt).toBeUndefined();

  expect(relations.recorded).toEqual([{ fromTaskId: result.requestId, toTaskId: result.taskId, relation: "generates" }]);
  expect(requests.jobs).toEqual([{ kind: TRANSCRIPTION_JOB, userId: actor.userId, taskId: result.requestId }]);
});

test("com a leitura do dia concluída, o pedido a devolve para a fazer e liga o documento a ela, sem criar outra", async () => {
  const { useCase, database, taskRepository, requests, relations } = setup({
    tasks: [reading({ status: "done", finishedAt: new Date("2026-08-17T12:00:00.000Z") })],
  });

  const result = await useCase.execute({ url: VIDEO }, actor);

  expect(result).toMatchObject({ taskId: "hoje", created: true });
  const revised = await taskRepository.findById("hoje");
  expect(revised).toMatchObject({
    status: "todo",
    startedAt: new Date("2026-08-17T11:00:00.000Z"),
    artifactLinks: [{ artifactId: result.artifactId, relation: "creates" }],
    revision: 2,
  });
  expect(revised?.finishedAt).toBeUndefined();
  expect(database.tasks.filter((task) => task.actor === "human")).toHaveLength(1);
  expect(relations.recorded).toEqual([{ fromTaskId: result.requestId, toTaskId: "hoje", relation: "updates" }]);
});

test.each(["awaiting_transcription", "running"] as const)(
  "o mesmo vídeo no mesmo dia, com o pedido %s, devolve o pedido que existe e não grava nada",
  async (status) => {
    const { useCase, taskRepository, batchWriter, requests, database } = setup();
    const first = await useCase.execute({ url: VIDEO }, actor);
    const request = await taskRepository.findById(first.requestId);
    if (!request) throw new Error("o pedido não foi criado");
    database.tasks = database.tasks.map((task) => (task.id === request.id ? withStatus(task, status) : task));
    const commits = batchWriter.commits.length;

    const again = await useCase.execute({ url: "https://youtu.be/dQw4w9WgXcQ?t=90" }, actor);

    expect(again).toEqual({ ...first, created: false });
    expect(batchWriter.commits).toHaveLength(commits);
    expect(database.tasks.filter((task) => task.kind === "save_content_with_transcription")).toHaveLength(1);
    expect(requests.jobs).toHaveLength(1);
  },
);

test.each(["done", "failed"] as const)(
  "o mesmo vídeo no mesmo dia, com o pedido já %s, cria outro pedido que atualiza o mesmo documento e devolve a leitura para a fazer",
  async (status) => {
    const { useCase, taskRepository, artifactRepository, database, requests, relations } = setup();
    const first = await useCase.execute({ url: VIDEO }, actor);
    const finished = await taskRepository.findById(first.requestId);
    const readingTask = await taskRepository.findById(first.taskId);
    if (!finished || !readingTask) throw new Error("o pedido não foi criado");
    database.tasks = database.tasks.map((task) =>
      task.id === finished.id
        ? withStatus(finished, status, now)
        : task.id === readingTask.id
          ? readingTask.revise({ status: "done", finishedAt: now }, now)
          : task,
    );
    const document = await artifactRepository.findById(first.artifactId);
    if (!document) throw new Error("o documento não foi criado");
    await artifactRepository.update(document.revise({ data: { body: `Fonte: [YouTube](${VIDEO})\n\nTexto pronto.\n` } }), actor.userId, 1);

    const second = await useCase.execute({ url: VIDEO }, actor);

    expect(second).toMatchObject({ created: true, taskId: first.taskId, artifactId: first.artifactId });
    expect(second.requestId).not.toBe(first.requestId);
    expect(database.artifacts).toHaveLength(1);
    expect(bodyOf(await artifactRepository.findById(first.artifactId))).toBe(QUEUE_BODY);
    expect(await taskRepository.findById(second.requestId)).toMatchObject({
      status: "awaiting_transcription",
      artifactLinks: [{ artifactId: first.artifactId, relation: "updates" }],
    });
    const revised = await taskRepository.findById(first.taskId);
    expect(revised).toMatchObject({ status: "todo" });
    expect(revised?.finishedAt).toBeUndefined();
    expect(relations.recorded.at(-1)).toEqual({ fromTaskId: second.requestId, toTaskId: first.taskId, relation: "updates" });
    expect(requests.jobs).toHaveLength(2);
  },
);

test("o pedido em aberto de outro dia não vale: o vídeo pedido hoje vai para a leitura de hoje", async () => {
  const { useCase, database } = setup();
  database.tasks.push(
    Task.create({
      id: "ontem",
      userId: actor.userId,
      actor: "agent",
      kind: "save_content_with_transcription",
      status: "awaiting_transcription",
      name: "Transcrição",
      startedAt: new Date("2026-08-16T15:00:00.000Z"),
      data: { url: VIDEO, day: "2026-08-16", videoId: "dQw4w9WgXcQ", readingTaskId: "leitura-de-ontem", artifactId: "doc-de-ontem" },
    }),
  );

  const result = await useCase.execute({ url: VIDEO }, actor);

  expect(result.created).toBe(true);
  expect(result.requestId).not.toBe("ontem");
});

test("o pedido em aberto de outra pessoa não vale", async () => {
  const { useCase } = setup();
  const first = await useCase.execute({ url: VIDEO }, actor);

  const other = await useCase.execute({ url: VIDEO }, { userId: "auth-user-2" });

  expect(other.created).toBe(true);
  expect(other.requestId).not.toBe(first.requestId);
  expect(other.taskId).not.toBe(first.taskId);
});

test("outro vídeo no mesmo dia vira outro documento e outro pedido na mesma leitura", async () => {
  const { useCase, taskRepository } = setup();
  const first = await useCase.execute({ url: VIDEO }, actor);

  const second = await useCase.execute({ url: "https://www.youtube.com/shorts/abcdefghijk" }, actor);

  expect(second).toMatchObject({ created: true, taskId: first.taskId });
  expect(second.artifactId).not.toBe(first.artifactId);
  expect((await taskRepository.findById(first.taskId))?.artifactLinks.map((link) => link.artifactId)).toEqual([first.artifactId, second.artifactId]);
});

test("dois cliques ao mesmo tempo no mesmo vídeo dão um pedido só", async () => {
  const { useCase, database, requests } = setup();

  const [first, second] = await Promise.all([useCase.execute({ url: VIDEO }, actor), useCase.execute({ url: VIDEO }, actor)]);

  expect([first.created, second.created]).toEqual([true, false]);
  expect(second.requestId).toBe(first.requestId);
  expect(database.tasks.filter((task) => task.kind === "save_content_with_transcription")).toHaveLength(1);
  expect(requests.jobs).toHaveLength(1);
});

test.each([
  "https://www.youtube.com/@canal",
  "https://www.youtube.com/playlist?list=PL123",
  "https://www.youtube.com/results?search_query=juros",
  "https://www.youtube.com/watch?v=curto",
  "https://vimeo.com/123456789",
  "chrome://extensions",
  "não é endereço",
])("%s é recusado antes de qualquer gravação", async (url) => {
  const { useCase, batchWriter, requests } = setup();

  await expect(useCase.execute({ url }, actor)).rejects.toThrow(TaskValidationError);
  expect(batchWriter.commits).toEqual([]);
  expect(requests.jobs).toEqual([]);
});

test("se a gravação falha, nem pedido, nem documento, nem job ficam, e o próximo pedido passa", async () => {
  const { useCase, batchWriter, database, requests } = setup();
  const commit = batchWriter.commit.bind(batchWriter);
  batchWriter.commit = async () => {
    batchWriter.commit = commit;
    throw new Error("banco fora do ar");
  };

  await expect(useCase.execute({ url: VIDEO }, actor)).rejects.toThrow("banco fora do ar");
  expect(database.tasks).toEqual([]);
  expect(requests.jobs).toEqual([]);
  await expect(useCase.execute({ url: VIDEO }, actor)).resolves.toMatchObject({ created: true });
});
