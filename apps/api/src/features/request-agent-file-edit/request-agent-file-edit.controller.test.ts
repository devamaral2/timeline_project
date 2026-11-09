import { describe, expect, it } from "vitest";
import { agentFileEditPrompt } from "./request-agent-file-edit.controller";

describe("agentFileEditPrompt", () => {
  it("names the file, carries the request and asks Hermes to check the impact before editing", () => {
    const text = agentFileEditPrompt("hermes/agents/revisor.md", "seja mais curto");
    expect(text).toContain("`hermes/agents/revisor.md`");
    expect(text).toContain("seja mais curto");
    expect(text).toMatch(/avalie o impacto/);
    expect(text).toMatch(/NÃO edite/);
  });
});
