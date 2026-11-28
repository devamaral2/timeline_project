import { expect, test } from "vitest";
import {
  AgentLimitReachedError,
  AgentTargetForbiddenError,
  InvalidInputError,
  LlmUnavailableError,
} from "../api-core/agent/errors/agent.errors";
import { TranscriptionLeaseLostError } from "../api-core/transcription/transcription-requests";
import {
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactRevisionConflictError,
  ArtifactValidationError,
  EntityBatchConflictError,
  ProjectNameTakenError,
  ProjectNotFoundError,
  ProjectValidationError,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  RecurrenceValidationError,
  TaskNotFoundError,
  TaskOwnershipError,
  TaskRevisionConflictError,
  TaskSituationNotAllowedError,
  TaskValidationError,
} from "../domain";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "./http-errors";
import { httpStatusFor } from "./http-status";

test("os erros de request da propria aplicacao carregam o status e preservam a mensagem", () => {
  const errors = [
    [new BadRequestError("Invalid limit"), 400, "Invalid limit"],
    [new ForbiddenError("Sem permissão"), 403, "Sem permissão"],
    [new NotFoundError("Task not found"), 404, "Task not found"],
    [new ConflictError("A request with this Idempotency-Key is in progress"), 409, "A request with this Idempotency-Key is in progress"],
  ] as const;

  for (const [error, status, message] of errors) {
    expect(httpStatusFor(error), message).toBe(status);
    expect(error.message).toBe(message);
  }
});

test("os erros de dominio continuam na mesma tabela de status", () => {
  expect(httpStatusFor(new TaskValidationError("bad input"))).toBe(400);
  expect(httpStatusFor(new TaskOwnershipError())).toBe(403);
  expect(httpStatusFor(new TaskNotFoundError("Task not found"))).toBe(404);
  expect(httpStatusFor(new TaskRevisionConflictError("revision"))).toBe(409);
  expect(httpStatusFor(new TaskSituationNotAllowedError())).toBe(409);
  expect(httpStatusFor(new ArtifactValidationError("data"))).toBe(400);
  expect(httpStatusFor(new ArtifactOwnershipError())).toBe(403);
  expect(httpStatusFor(new ArtifactNotFoundError("Artifact not found"))).toBe(404);
  expect(httpStatusFor(new ArtifactRevisionConflictError("revision"))).toBe(409);
  expect(httpStatusFor(new ProjectValidationError("name"))).toBe(400);
  expect(httpStatusFor(new ProjectNameTakenError("Project already exists"))).toBe(409);
  expect(httpStatusFor(new ProjectNotFoundError())).toBe(404);
  expect(httpStatusFor(new RecurrenceValidationError("rule"))).toBe(400);
  expect(httpStatusFor(new RecurrenceOwnershipError())).toBe(403);
  expect(httpStatusFor(new RecurrenceNotFoundError("Recurrence not found"))).toBe(404);
  expect(httpStatusFor(new RecurrenceRevisionConflictError("revision"))).toBe(409);
  expect(httpStatusFor(new EntityBatchConflictError("mudou"))).toBe(409);
  expect(httpStatusFor(new TranscriptionLeaseLostError())).toBe(409);
  expect(httpStatusFor(new InvalidInputError("corpo vazio"))).toBe(400);
  expect(httpStatusFor(new AgentTargetForbiddenError())).toBe(403);
  expect(httpStatusFor(new AgentLimitReachedError())).toBe(422);
  expect(httpStatusFor(new LlmUnavailableError("fora do ar"))).toBe(502);
});

test("o que nao tem traducao vira 500", () => {
  expect(httpStatusFor(new Error("boom"))).toBe(500);
  expect(httpStatusFor(new TypeError("undefined is not a function"))).toBe(500);
  expect(httpStatusFor("boom")).toBe(500);
  expect(httpStatusFor(undefined)).toBe(500);
});
