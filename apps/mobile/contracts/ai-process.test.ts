import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiProcessSchema } from "../../../packages/contracts/src/schemas";
import { isAiProcessTerminal, type AiProcessDto } from "../../../packages/contracts/src/agent/contracts/ai-process.dto";

const fixture = JSON.parse(
  readFileSync(new URL("../app/src/test/resources/fixtures/ai-process.json", import.meta.url), "utf8"),
) as AiProcessDto[];

describe("Android process box wire fixtures", () => {
  it("every fixture satisfies the shared schema Kotlin's strict decoder follows", () => {
    for (const process of fixture) expect(() => aiProcessSchema.parse(process), process.id).not.toThrow();
  });

  it("covers the states the box draws: running, success, failure with message, query rows and reply", () => {
    const byId = new Map(fixture.map((process) => [process.id, process]));
    expect(byId.get("process-running")?.steps.map((step) => step.status)).toEqual(["succeeded", "running", "pending"]);
    expect(byId.get("process-guide")?.entities.map((entity) => entity.linkedTo.length)).toEqual([1, 1]);
    expect(byId.get("process-failed")?.steps.at(-1)).toMatchObject({ status: "failed", errorCode: "agent_timeout" });
    expect(byId.get("process-failed")?.message).toBe("Criei o evento, mas não consegui criar a nota.");
    expect(byId.get("process-query")?.steps[0].result).toMatchObject({ columns: ["name", "started_at"], truncated: false });
    expect(byId.get("process-reply")?.message).toBe("Paris.");
  });

  it("polling stops only on a terminal status", () => {
    expect(fixture.filter(isAiProcessTerminal).map((process) => process.id)).not.toContain("process-running");
    expect(fixture.filter((process) => !isAiProcessTerminal(process))).toHaveLength(1);
  });
});
