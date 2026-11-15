import { describe, expect, it } from "vitest";
import type { EventCardDto } from "@repo/contracts";
import { eventFixture } from "@/test/fake-api/events";
import { hasOpenAgentEvent } from "./agent-request-model";

function agentCard(status: EventCardDto["status"]): EventCardDto {
  return eventFixture({ id: `agent-${status}`, actor: "agent", kind: "request", status }) as EventCardDto;
}

describe("hasOpenAgentEvent", () => {
  it.each(["queued", "running", "waiting"] as const)("um evento de agente em %s deixa a lista aberta", (status) => {
    expect(hasOpenAgentEvent([agentCard(status)])).toBe(true);
  });

  it.each(["done", "failed", "cancel"] as const)("um evento de agente em %s não conta", (status) => {
    expect(hasOpenAgentEvent([agentCard(status)])).toBe(false);
  });

  it("evento de pessoa nunca conta, mesmo com status que o agente também usa", () => {
    const person = eventFixture({ id: "luz", actor: "human", status: "doing" }) as EventCardDto;
    expect(hasOpenAgentEvent([person])).toBe(false);
  });

  it("uma lista sem nenhum evento de agente não está aberta", () => {
    expect(hasOpenAgentEvent([])).toBe(false);
  });

  it("basta um evento de agente em aberto no meio de muitos fechados", () => {
    expect(hasOpenAgentEvent([agentCard("done"), eventFixture({ id: "luz", status: "todo" }) as EventCardDto, agentCard("running")])).toBe(true);
  });
});
