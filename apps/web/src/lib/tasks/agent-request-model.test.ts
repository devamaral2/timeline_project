import { describe, expect, it } from "vitest";
import type { TaskCardDto } from "@repo/contracts";
import { taskFixture } from "@/test/fake-api/tasks";
import { hasOpenAgentTask } from "./agent-request-model";

function agentCard(status: TaskCardDto["status"]): TaskCardDto {
  return taskFixture({ id: `agent-${status}`, actor: "agent", kind: "request", status }) as TaskCardDto;
}

describe("hasOpenAgentTask", () => {
  it.each(["preparing", "queued", "starting", "running", "waiting", "awaiting_transcription"] as const)("uma tarefa de agente em %s deixa a lista aberta", (status) => {
    expect(hasOpenAgentTask([agentCard(status)])).toBe(true);
  });

  it.each(["completed", "interrupted", "failed", "cancelled", "rolled_back"] as const)("uma tarefa de agente em %s não conta", (status) => {
    expect(hasOpenAgentTask([agentCard(status)])).toBe(false);
  });

  it("tarefa de pessoa nunca conta, mesmo com status que o agente também usa", () => {
    const person = taskFixture({ id: "luz", actor: "human", status: "doing" }) as TaskCardDto;
    expect(hasOpenAgentTask([person])).toBe(false);
  });

  it("uma lista sem nenhuma tarefa de agente não está aberta", () => {
    expect(hasOpenAgentTask([])).toBe(false);
  });

  it("basta uma tarefa de agente em aberto no meio de muitos fechados", () => {
    expect(hasOpenAgentTask([agentCard("completed"), taskFixture({ id: "luz", status: "todo" }) as TaskCardDto, agentCard("running")])).toBe(true);
  });
});
