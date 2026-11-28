import "reflect-metadata";
import { GUARDS_METADATA, HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { BadRequestError } from "../../common/http-errors";
import { describe, expect, test } from "vitest";
import { Task, TaskNotFoundError, TaskSituationNotAllowedError, type TaskCreateProps } from "../../domain";
import { InMemoryTaskCardQuery } from "../../api-core/tasks/testing/in-memory-task-card.query";
import { InMemoryTaskDatabase } from "../../api-core/tasks/testing/in-memory-task-database";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { SetTaskSituationController } from "./set-task-situation.controller";
import { SetTaskSituationUseCase } from "./set-task-situation.usecase";

const actor = { userId: "auth-user-1" };
const startedAt = new Date("2026-11-20T12:00:00.000Z");

function agent(id: string, props: Partial<TaskCreateProps> = {}): Task {
  return Task.create({ id, userId: actor.userId, actor: "agent", kind: "request", status: "completed", name: "Pedido", startedAt, ...props });
}

function setup(tasks: Task[]) {
  const database = new InMemoryTaskDatabase(tasks);
  const useCase = new SetTaskSituationUseCase(new InMemoryTaskRepository(database), new InMemoryTaskCardQuery(database));
  return { database, useCase, controller: new SetTaskSituationController(useCase) };
}

describe("definir a situacao", () => {
  test("troca entre os tres valores, a partir de qualquer um, e devolve o cartao atualizado", async () => {
    const { useCase } = setup([agent("r1", { situation: "to_review" })]);

    const sequence = ["reviewed", "bookmarked", "to_review", "bookmarked", "reviewed"] as const;
    for (const situation of sequence) {
      const card = await useCase.execute({ taskId: "r1", situation }, actor);
      expect(card).toMatchObject({ id: "r1", actor: "agent", status: "completed", situation });
    }
  });

  test("a mudanca fica gravada: o cartao lido depois traz a situacao", async () => {
    const { useCase, database } = setup([agent("r1")]);
    expect(new InMemoryTaskCardQuery(database).cardsOf(["r1"])).resolves.toMatchObject([{ task: { situation: undefined } }]);

    await useCase.execute({ taskId: "r1", situation: "bookmarked" }, actor);

    expect((await new InMemoryTaskCardQuery(database).cardsOf(["r1"]))[0]?.task.situation).toBe("bookmarked");
  });

  test("nao pede revisao e vale a ultima gravacao", async () => {
    const { useCase } = setup([agent("r1")]);

    const first = await useCase.execute({ taskId: "r1", situation: "reviewed" }, actor);
    const second = await useCase.execute({ taskId: "r1", situation: "to_review" }, actor);

    expect(second.situation).toBe("to_review");
    expect(second.revision).toBeGreaterThanOrEqual(first.revision);
  });

  test("tarefa que nao existe e tarefa de outro usuario respondem 404 igual", async () => {
    const { useCase } = setup([agent("r1")]);

    await expect(useCase.execute({ taskId: "nao-existe", situation: "reviewed" }, actor)).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(useCase.execute({ taskId: "r1", situation: "reviewed" }, { userId: "outro" })).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  test.each([
    ["tarefa de pessoa", Task.create({ id: "h1", userId: actor.userId, name: "Ler", status: "done", startedAt })],
    ["passo", agent("s1", { kind: "step" })],
    ["execucao agendada", agent("c1", { kind: "cron" })],
    ["tarefa aberta", agent("a1", { status: "running" })],
    ["tarefa esperando", agent("a2", { status: "waiting" })],
  ])("%s nao aceita situacao: 409", async (_, task) => {
    const { useCase } = setup([task]);

    await expect(useCase.execute({ taskId: task.id, situation: "reviewed" }, actor)).rejects.toBeInstanceOf(TaskSituationNotAllowedError);
  });
});

describe("PUT /api/tasks/:taskId/situation", () => {
  test("o corpo so tem situacao, e um valor desconhecido e recusado", async () => {
    const { controller } = setup([agent("r1")]);

    await expect(controller.execute("r1", { situation: "reviewed" }, actor)).resolves.toMatchObject({ situation: "reviewed" });
    expect(() => controller.execute("r1", { situation: "archived" } as never, actor)).toThrow(BadRequestError);
    expect(() => controller.execute("r1", { situation: "reviewed", expectedRevision: 1 } as never, actor)).toThrow(BadRequestError);
    expect(() => controller.execute("r1", {} as never, actor)).toThrow(BadRequestError);
  });

  test("responde 200 e fica atras da identidade do gateway", () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, SetTaskSituationController.prototype.execute)).toBe(200);
    expect(Reflect.getMetadata(GUARDS_METADATA, SetTaskSituationController.prototype.execute)).toContain(GatewayIdentityGuard);
  });
});
