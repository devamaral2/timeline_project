import { expect, test } from "vitest";
import { InMemoryTaskRelations } from "../../api-core/tasks/testing/in-memory-task-relations";
import { InMemoryTaskCardQuery } from "../../api-core/tasks/testing/in-memory-task-card.query";
import { createTasksKit, type TasksKitOptions } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Artifact, Task, TaskValidationError } from "../../domain";
import { composeReadingArticle, isDailyReadingName, readingSourceOf, readingSourceUrl } from "./daily-reading-article";
import { DailyReadingGate } from "./daily-reading.gate";
import { SaveDailyReadingUseCase } from "./save-daily-reading.usecase";

const actor = { userId: "auth-user-1" };
// 17/08/2026, 12:00 em Sao Paulo.
const now = new Date("2026-08-17T15:00:00.000Z");
// 17/08/2026, 18:00 em Sao Paulo.
const sixPm = new Date("2026-08-17T21:00:00.000Z");

const page = {
  url: "https://jornal.example/economia/juros?ref=home#comentarios",
  title: "Juros caem pela terceira vez",
  markdown: "O comitê cortou a taxa.\n\n![Gráfico](https://cdn.example/g.png)",
  siteName: "Jornal Exemplo",
  byline: "Ana Lima",
};

function setup(options: TasksKitOptions = {}, materialized: Date[] = []) {
  const kit = createTasksKit({ ...options, clock: () => now });
  const gate = new DailyReadingGate(
    new InMemoryTaskCardQuery(kit.database),
    kit.artifactRepository,
    kit.artifactBuilder,
    kit.createTask,
    kit.batchWriter,
    { materialize: async (_userId, until) => void materialized.push(until as Date) },
    () => now,
  );
  const relations = new InMemoryTaskRelations();
  const useCase = new SaveDailyReadingUseCase(gate, relations);
  return { ...kit, useCase, materialized, relations };
}

function task(id: string, startedAt: string, overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({ id, userId: actor.userId, name: "Leitura diária", startedAt: new Date(startedAt), ...overrides });
}

/** As tarefas que não são o registro `save_content` de uma gravação. */
const withoutSaves = (tasks: Task[]) => tasks.filter((candidate) => candidate.kind !== "save_content");

const bodyOf = (artifact: Artifact | null) => (artifact?.data as { body: string }).body;

test("sem a leitura do dia, a tarefa nasce a fazer às 18h com a página como artefato, numa gravação só", async () => {
  const { useCase, taskRepository, artifactRepository, batchWriter } = setup();

  const result = await useCase.execute(page, actor);

  expect(result).toMatchObject({ taskCreated: true, artifactCreated: true });
  expect(batchWriter.commits).toHaveLength(1);
  const created = await taskRepository.findById(result.taskId);
  expect(created).toMatchObject({
    userId: actor.userId,
    actor: "human",
    name: "Leitura diária",
    status: "todo",
    startedAt: sixPm,
    artifactLinks: [{ artifactId: result.artifactId, relation: "creates", fromRecurrence: false }],
  });
  expect(created?.finishedAt).toBeUndefined();
  const artifact = await artifactRepository.findById(result.artifactId);
  expect(artifact).toMatchObject({ userId: actor.userId, type: "text", name: "Juros caem pela terceira vez" });
  expect(bodyOf(artifact)).toBe(
    "Fonte: [Jornal Exemplo](https://jornal.example/economia/juros?ref=home) · Ana Lima\n\nO comitê cortou a taxa.\n\n![Gráfico](https://cdn.example/g.png)\n",
  );
});

test("com a leitura do dia, a página entra nela e nenhuma leitura nasce", async () => {
  const other = { artifactId: "pauta", relation: "uses" as const, fromRecurrence: false };
  const { useCase, database, taskRepository } = setup({
    tasks: [task("hoje", "2026-08-17T11:00:00.000Z", { artifactLinks: [other] })],
    artifacts: [Artifact.create({ id: "pauta", userId: actor.userId, data: { body: "pauta" } })],
  });

  const result = await useCase.execute(page, actor);

  expect(result).toEqual({ taskId: "hoje", artifactId: result.artifactId, taskCreated: false, artifactCreated: true });
  expect(withoutSaves(database.tasks)).toHaveLength(1);
  expect(await taskRepository.findById("hoje")).toMatchObject({
    artifactLinks: [other, { artifactId: result.artifactId, relation: "creates", fromRecurrence: false }],
    revision: 2,
  });
});

test("uma página nova numa leitura concluída a devolve para a fazer, sem mexer no horário", async () => {
  const { useCase, taskRepository } = setup({
    tasks: [task("hoje", "2026-08-17T11:00:00.000Z", { status: "done", finishedAt: new Date("2026-08-17T12:00:00.000Z") })],
  });

  await useCase.execute(page, actor);

  const revised = await taskRepository.findById("hoje");
  expect(revised).toMatchObject({ status: "todo", startedAt: new Date("2026-08-17T11:00:00.000Z"), revision: 2 });
  expect(revised?.finishedAt).toBeUndefined();
});

test("atualizar uma página já guardada também devolve a leitura para a fazer", async () => {
  const { useCase, taskRepository, batchWriter } = setup();
  const first = await useCase.execute(page, actor);
  const created = await taskRepository.findById(first.taskId);
  if (!created) throw new Error("a leitura do dia não foi criada");
  await taskRepository.save(created.revise({ status: "done", finishedAt: now }, now));

  await useCase.execute({ ...page, markdown: "Texto atualizado." }, actor);

  const revised = await taskRepository.findById(first.taskId);
  expect(revised).toMatchObject({ status: "todo", startedAt: sixPm });
  expect(revised?.finishedAt).toBeUndefined();
  expect(batchWriter.commits.at(-1)?.tasks.filter((change) => change.op === "update")).toHaveLength(1);
});

test("o nome da tarefa é reconhecido sem acento nem caixa, e as séries do dia são geradas antes da busca", async () => {
  const { useCase, materialized } = setup({ tasks: [task("serie", "2026-08-17T23:30:00.000Z", { name: "  leitura  DIARIA " })] });

  const result = await useCase.execute(page, actor);

  expect(result).toMatchObject({ taskId: "serie", taskCreated: false });
  // O fim do dia 17 em Sao Paulo.
  expect(materialized).toEqual([new Date("2026-08-18T02:59:59.999Z")]);
});

test("a leitura de outro dia, de outra pessoa, de agente ou com outro nome não serve", async () => {
  const { useCase, database } = setup({
    tasks: [
      task("ontem", "2026-08-17T02:30:00.000Z"),
      task("amanha", "2026-08-18T03:00:00.000Z"),
      task("deles", "2026-08-17T12:00:00.000Z", { userId: "someone-else" }),
      task("leitura", "2026-08-17T12:00:00.000Z", { name: "Leitura" }),
      task("agente", "2026-08-17T12:00:00.000Z", { actor: "agent", kind: "request", status: "done" }),
    ],
  });

  const result = await useCase.execute(page, actor);

  expect(result.taskCreated).toBe(true);
  expect(withoutSaves(database.tasks)).toHaveLength(6);
});

test("com duas leituras no dia, a página vai para a que começa mais cedo", async () => {
  const { useCase } = setup({ tasks: [task("tarde", "2026-08-17T19:00:00.000Z"), task("manha", "2026-08-17T11:00:00.000Z")] });

  expect((await useCase.execute(page, actor)).taskId).toBe("manha");
});

test("a mesma página guardada de novo no dia atualiza o artefato dela, mesmo com outro trecho depois de #", async () => {
  const { useCase, database, artifactRepository, taskRepository } = setup();
  const first = await useCase.execute(page, actor);

  const second = await useCase.execute(
    { ...page, url: "https://jornal.example/economia/juros?ref=home#topo", title: "Juros caem de novo", markdown: "Texto atualizado." },
    actor,
  );

  expect(second).toEqual({ taskId: first.taskId, artifactId: first.artifactId, taskCreated: false, artifactCreated: false });
  expect(withoutSaves(database.tasks)).toHaveLength(1);
  expect(database.artifacts).toHaveLength(1);
  const artifact = await artifactRepository.findById(first.artifactId);
  expect(artifact).toMatchObject({ name: "Juros caem de novo", revision: 2 });
  expect(bodyOf(artifact)).toContain("Texto atualizado.");
  expect((await taskRepository.findById(first.taskId))?.artifactLinks).toHaveLength(1);
});

test("outra página no mesmo dia vira outro artefato da mesma tarefa", async () => {
  const { useCase, taskRepository } = setup();
  const first = await useCase.execute(page, actor);

  const second = await useCase.execute({ ...page, url: "https://jornal.example/economia/juros?ref=busca" }, actor);

  expect(second).toMatchObject({ taskId: first.taskId, taskCreated: false, artifactCreated: true });
  expect((await taskRepository.findById(first.taskId))?.artifactLinks.map((link) => link.artifactId)).toEqual([
    first.artifactId,
    second.artifactId,
  ]);
});

test("duas páginas guardadas ao mesmo tempo caem na mesma tarefa", async () => {
  const { useCase, database } = setup();

  const [first, second] = await Promise.all([
    useCase.execute(page, actor),
    useCase.execute({ ...page, url: "https://outro.example/a" }, actor),
  ]);

  expect(withoutSaves(database.tasks)).toHaveLength(1);
  expect(second.taskId).toBe(first.taskId);
  expect([first.taskCreated, second.taskCreated]).toEqual([true, false]);
});

test("guardar uma página registra a tarefa de agente save_content, já concluída, que cria o artefato e gera a leitura nova", async () => {
  const { useCase, taskRepository, relations, batchWriter, database } = setup();

  const result = await useCase.execute(page, actor);

  // A leitura, o artefato e o registro do que a extensão fez: uma gravação só.
  expect(batchWriter.commits).toHaveLength(1);
  expect(database.tasks).toHaveLength(2);
  const saved = database.tasks.find((candidate) => candidate.kind === "save_content");
  expect(saved).toMatchObject({
    userId: actor.userId,
    actor: "agent",
    kind: "save_content",
    status: "done",
    startedAt: now,
    finishedAt: now,
    data: { url: "https://jornal.example/economia/juros?ref=home" },
    artifactLinks: [{ artifactId: result.artifactId, relation: "creates", fromRecurrence: false }],
  });
  expect(relations.recorded).toEqual([{ fromTaskId: saved?.id, toTaskId: result.taskId, relation: "generates" }]);
  // A leitura continua sem nenhuma relação de agente nos seus artefatos.
  expect((await taskRepository.findById(result.taskId))?.actor).toBe("human");
});

test("numa leitura que já existe, save_content a altera, e o artefato novo é criado por ele", async () => {
  const { useCase, database, relations } = setup({ tasks: [task("hoje", "2026-08-17T11:00:00.000Z")] });

  const result = await useCase.execute(page, actor);

  const saved = database.tasks.find((candidate) => candidate.kind === "save_content");
  expect(saved?.artifactLinks).toEqual([{ artifactId: result.artifactId, relation: "creates", fromRecurrence: false }]);
  expect(relations.recorded).toEqual([{ fromTaskId: saved?.id, toTaskId: "hoje", relation: "updates" }]);
});

test("guardar de novo a mesma página registra outro save_content, que atualiza o artefato e a leitura", async () => {
  const { useCase, database, relations } = setup();
  const first = await useCase.execute(page, actor);

  const second = await useCase.execute({ ...page, markdown: "Texto atualizado." }, actor);

  const saves = database.tasks.filter((candidate) => candidate.kind === "save_content");
  expect(saves).toHaveLength(2);
  expect(saves[1]?.artifactLinks).toEqual([{ artifactId: second.artifactId, relation: "updates", fromRecurrence: false }]);
  expect(second.artifactId).toBe(first.artifactId);
  expect(relations.recorded.at(-1)).toEqual({ fromTaskId: saves[1]?.id, toTaskId: first.taskId, relation: "updates" });
  // Os save_content ficam fora da leitura: uma leitura só.
  expect(database.tasks.filter((candidate) => candidate.actor === "human")).toHaveLength(1);
});

test("uma falha não trava as próximas páginas da pessoa", async () => {
  const { useCase, batchWriter } = setup();
  const commit = batchWriter.commit.bind(batchWriter);
  batchWriter.commit = async () => {
    batchWriter.commit = commit;
    throw new Error("banco fora do ar");
  };

  await expect(useCase.execute(page, actor)).rejects.toThrow("banco fora do ar");
  await expect(useCase.execute(page, actor)).resolves.toMatchObject({ taskCreated: true });
});

test("um endereço que não é http(s) é recusado antes de qualquer gravação", async () => {
  const { useCase, batchWriter } = setup();

  await expect(useCase.execute({ ...page, url: "chrome://extensions" }, actor)).rejects.toThrow(TaskValidationError);
  expect(batchWriter.commits).toEqual([]);
});

test("a linha da fonte aguenta parênteses e colchetes e cai no domínio quando o site não diz o nome", () => {
  const article = composeReadingArticle({
    url: "https://pt.wikipedia.org/wiki/Candeia_(sambista)#Obra",
    title: "  Candeia\n(sambista)  ",
    markdown: "\nTexto.\n\n",
  });

  expect(article).toEqual({
    name: "Candeia (sambista)",
    sourceUrl: "https://pt.wikipedia.org/wiki/Candeia_%28sambista%29",
    body: "Fonte: [pt.wikipedia.org](https://pt.wikipedia.org/wiki/Candeia_%28sambista%29)\n\nTexto.\n",
  });
  const bracketed = composeReadingArticle({ ...page, siteName: "Blog [beta]\\", byline: undefined });
  expect(bracketed?.body.startsWith("Fonte: [Blog \\[beta\\]\\\\](https://jornal.example/economia/juros?ref=home)\n\n")).toBe(true);
  expect(readingSourceOf(bracketed?.body ?? "")).toBe("https://jornal.example/economia/juros?ref=home");
  expect(readingSourceOf("Fonte: sem link\n\ntexto")).toBeNull();
  expect(readingSourceOf("uma nota qualquer")).toBeNull();
  expect(readingSourceUrl("javascript:alert(1)")).toBeNull();
  expect(readingSourceUrl("não é endereço")).toBeNull();
});

test("só o nome inteiro é a leitura diária", () => {
  expect(isDailyReadingName("Leitura diária")).toBe(true);
  expect(isDailyReadingName("LEITURA DIARIA")).toBe(true);
  expect(isDailyReadingName("Leitura diária de ontem")).toBe(false);
  expect(isDailyReadingName("Leitura")).toBe(false);
});
