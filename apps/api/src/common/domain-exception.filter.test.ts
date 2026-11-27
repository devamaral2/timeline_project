import { BadRequestException, NotFoundException, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, test } from "vitest";
import {
  AgentLimitReachedError,
  AgentRunCancelledError,
  AgentTargetForbiddenError,
  InvalidInputError,
  LlmUnavailableError,
} from "../api-core/agent/errors/agent.errors";
import {
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactRevisionConflictError,
  ArtifactValidationError,
  EntityBatchConflictError,
  ProjectNameTakenError,
  ProjectNotFoundError,
  ProjectValidationError,
  TaskNotFoundError,
  TaskOwnershipError,
  TaskRevisionConflictError,
  TaskValidationError,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  RecurrenceValidationError,
} from "../domain";
import { DomainExceptionFilter } from "./domain-exception.filter";

/** Roda o erro pelo filtro de producao e devolve o que o cliente veria e o que foi para o log. */
function respond(error: unknown) {
  const logged: { level: "error" | "warn"; message: string }[] = [];
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  const logger = {
    log() {},
    error: (message: string) => logged.push({ level: "error", message }),
    warn: (message: string) => logged.push({ level: "warn", message }),
  };

  new DomainExceptionFilter(logger).catch(error, host);
  return { status: response.statusCode, body: response.body, logged };
}

const statusOf = (error: unknown) => respond(error).status;

describe("project errors", () => {
  test("maps a bad name to 400, a repeated name to 409 and a project that is not the user's to 404", () => {
    expect(statusOf(new ProjectValidationError("Project name is required"))).toBe(400);
    expect(statusOf(new ProjectNameTakenError("Project already exists: braid"))).toBe(409);
    expect(statusOf(new ProjectNotFoundError())).toBe(404);
  });
});

describe("task errors", () => {
  test("maps TaskValidationError to 400", () => {
    expect(statusOf(new TaskValidationError("bad input"))).toBe(400);
  });

  test("maps TaskOwnershipError to 403", () => {
    expect(statusOf(new TaskOwnershipError())).toBe(403);
  });

  test("maps TaskNotFoundError to 404", () => {
    expect(statusOf(new TaskNotFoundError("Task not found"))).toBe(404);
  });

  test("maps TaskRevisionConflictError to 409", () => {
    expect(statusOf(new TaskRevisionConflictError("Expected revision 1 but found 2"))).toBe(409);
  });
});

describe("artifact errors", () => {
  test("maps ArtifactValidationError to 400", () => {
    expect(statusOf(new ArtifactValidationError("Text artifact requires a body"))).toBe(400);
  });

  test("maps ArtifactOwnershipError to 403", () => {
    expect(statusOf(new ArtifactOwnershipError())).toBe(403);
  });

  test("maps ArtifactNotFoundError to 404", () => {
    expect(statusOf(new ArtifactNotFoundError("Artifact not found"))).toBe(404);
  });

  test("maps ArtifactRevisionConflictError to 409", () => {
    expect(statusOf(new ArtifactRevisionConflictError("Expected revision 1 but found 2"))).toBe(409);
  });
});

describe("recurrence errors", () => {
  test("maps the recurrence errors like the other aggregates", () => {
    expect(statusOf(new RecurrenceValidationError("bad rule"))).toBe(400);
    expect(statusOf(new RecurrenceOwnershipError())).toBe(403);
    expect(statusOf(new RecurrenceNotFoundError("Recurrence not found"))).toBe(404);
    expect(statusOf(new RecurrenceRevisionConflictError("Expected revision 1 but found 2"))).toBe(409);
  });
});

describe("batch and agent errors", () => {
  test("maps EntityBatchConflictError to 409: something changed between preparing and writing", () => {
    expect(statusOf(new EntityBatchConflictError("task-1 mudou antes do commit"))).toBe(409);
  });

  test("maps InvalidInputError to 400", () => {
    expect(statusOf(new InvalidInputError("corpo vazio"))).toBe(400);
  });

  test("maps AgentTargetForbiddenError to 403", () => {
    expect(statusOf(new AgentTargetForbiddenError())).toBe(403);
  });

  test("maps AgentLimitReachedError to 422", () => {
    expect(statusOf(new AgentLimitReachedError())).toBe(422);
  });

  test("maps LlmUnavailableError to 502", () => {
    expect(statusOf(new LlmUnavailableError("provedor fora do ar"))).toBe(502);
  });

  test("an agent error without a mapping is an unexpected error", () => {
    expect(statusOf(new AgentRunCancelledError())).toBe(500);
  });
});

describe("everything else", () => {
  test("keeps the status of a Nest HttpException", () => {
    expect(statusOf(new BadRequestException("Invalid limit"))).toBe(400);
    expect(statusOf(new NotFoundException("Task not found"))).toBe(404);
  });

  test("maps unexpected errors to 500, and not to 401", () => {
    expect(statusOf(new Error("boom"))).toBe(500);
    expect(statusOf(new TypeError("undefined is not a function"))).toBe(500);
  });

  test("maps something thrown that is not an error to 500, with a generic message", () => {
    expect(respond("boom")).toMatchObject({ status: 500, body: { error: "Invalid request" } });
    expect(statusOf(undefined)).toBe(500);
  });
});

describe("response and log", () => {
  test("answers with the message of the error", () => {
    expect(respond(new TaskOwnershipError()).body).toEqual({ error: "Only the task owner can modify it" });
    expect(respond(new ArtifactNotFoundError("Artifact not found: a1")).body).toEqual({ error: "Artifact not found: a1" });
  });

  test("warns about client errors and logs server errors as errors", () => {
    expect(respond(new TaskValidationError("bad input")).logged).toEqual([{ level: "warn", message: "400 — bad input" }]);
    expect(respond(new LlmUnavailableError("provedor fora do ar")).logged).toEqual([
      { level: "error", message: "provedor fora do ar" },
    ]);
    expect(respond(new Error("boom")).logged).toEqual([{ level: "error", message: "boom" }]);
  });
});
