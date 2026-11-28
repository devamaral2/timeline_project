import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { TaskNotFoundError, TaskSituationNotAllowedError, type Task, type TaskCreateProps } from "../../../domain";
import { SetTaskSituationUseCase } from "../../../features/set-task-situation/set-task-situation.usecase";
import { SqliteTaskCardQuery } from "../tasks/queries/sqlite-task-card.query";
import { SqliteTaskRepository } from "../tasks/repositories/sqlite-task.repository";
import { OTHER_USER, USER, agentTask, trackedTask } from "../testing/fixtures";
import { sql } from "../sqlite/sql";
import { createSqliteTestContext, type SqliteTestContext } from "../testing/sqlite-test-context";

describe("definir a situacao de um pedido de agente, no SQLite", () => {
  let ctx: SqliteTestContext;
  const run = (text: string, params: unknown[] = []) => ctx.db.execute(sql.unsafe(text, params));
  let tasks: SqliteTaskRepository;
  let useCase: SetTaskSituationUseCase;
  const actor = { userId: USER };

  beforeAll(async () => {
    ctx = await createSqliteTestContext();
    tasks = new SqliteTaskRepository(ctx.db);
    useCase = new SetTaskSituationUseCase(tasks, new SqliteTaskCardQuery(ctx.db));
  }, 60000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  async function saved(task: Task): Promise<Task> {
    await tasks.save(task);
    return task;
  }
  const finished = (props: Partial<TaskCreateProps> = {}) => saved(agentTask(USER, "Pedido", { status: "completed", ...props }));
  const stored = async (id: string) => (await tasks.findById(id))?.situation;

  test("troca entre os tres valores, a partir de qualquer um, e o cartao e a leitura trazem a situacao", async () => {
    const request = await finished({ situation: "to_review" });

    for (const situation of ["reviewed", "bookmarked", "to_review", "reviewed", "to_review", "bookmarked"] as const) {
      const card = await useCase.execute({ taskId: request.id, situation }, actor);
      expect(card).toMatchObject({ id: request.id, status: "completed", situation });
      expect(await stored(request.id)).toBe(situation);
    }
  });

  test("a tarefa final sem situacao tambem aceita, em qualquer status final", async () => {
    for (const status of ["completed", "interrupted", "failed", "cancelled", "rolled_back"] as const) {
      const request = await finished({ status });
      expect(await stored(request.id)).toBeUndefined();

      await useCase.execute({ taskId: request.id, situation: "bookmarked" }, actor);

      expect(await stored(request.id), status).toBe("bookmarked");
    }
  });

  test("tarefa que nao existe e tarefa de outro usuario respondem 404 e nada muda", async () => {
    const request = await finished({ situation: "to_review" });

    await expect(useCase.execute({ taskId: "01NAOEXISTE000000000000000", situation: "reviewed" }, actor)).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
    await expect(useCase.execute({ taskId: request.id, situation: "reviewed" }, { userId: OTHER_USER })).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
    expect(await stored(request.id)).toBe("to_review");
  });

  test("tarefa de pessoa, passo, execucao agendada e tarefa aberta respondem 409 e nada muda", async () => {
    const candidates = [
      await saved(trackedTask(USER, "Ler", { status: "done" })),
      await saved(agentTask(USER, "Passo", { kind: "step", status: "completed" })),
      await saved(agentTask(USER, "Rotina", { kind: "cron", status: "completed" })),
      await saved(agentTask(USER, "Aberta", { status: "running" })),
      await saved(agentTask(USER, "Esperando", { status: "waiting" })),
    ];

    for (const task of candidates) {
      await expect(useCase.execute({ taskId: task.id, situation: "reviewed" }, actor), task.name).rejects.toBeInstanceOf(
        TaskSituationNotAllowedError,
      );
      expect(await stored(task.id), task.name).toBeUndefined();
    }
  });

  test("a gravacao confere o status de novo: o pedido que voltou a abrir depois da leitura nao ganha situacao", async () => {
    const request = await finished();
    await run("UPDATE tasks SET status = 'running' WHERE id = $1", [request.id]);

    expect(await tasks.setSituation(request.id, USER, "reviewed")).toBe(false);
    expect((await run("SELECT situation FROM tasks WHERE id = $1", [request.id])).rows[0].situation).toBeNull();
  });
});
