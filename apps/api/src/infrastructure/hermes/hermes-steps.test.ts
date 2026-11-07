import { describe, expect, test } from "vitest";
import { HermesStepsTracker, toolLabel } from "./hermes-steps";

describe("toolLabel", () => {
  test("known tools get a readable Portuguese label, MCP agenda tools included", () => {
    expect(toolLabel("terminal")).toBe("Executou um comando");
    expect(toolLabel("web_search")).toBe("Pesquisou na web");
    expect(toolLabel("mcp_braid_create_note")).toBe("Criou uma nota");
    expect(toolLabel("mcp_braid_update_task")).toBe("Editou uma tarefa");
  });

  test("an unknown tool keeps its name", () => {
    expect(toolLabel("some_new_tool")).toBe("Usou some new tool");
    expect(toolLabel("mcp_braid_unknown")).toBe("Usou mcp braid unknown");
  });
});

describe("HermesStepsTracker", () => {
  test("a tool runs, then completes with its duration", () => {
    const tracker = new HermesStepsTracker();

    expect(tracker.apply({ event: "tool.started", tool: "terminal", preview: "ls -la", tool_call_id: "c1" })).toBe(true);
    expect(tracker.snapshot()).toEqual([
      { id: "c1", kind: "tool", label: "Executou um comando", detail: "ls -la", status: "running" },
    ]);

    expect(tracker.apply({ event: "tool.completed", tool: "terminal", duration: 1.234, error: false, tool_call_id: "c1" })).toBe(true);
    expect(tracker.snapshot()[0]).toMatchObject({ status: "done", durationMs: 1234 });
  });

  test("a failed tool is marked failed", () => {
    const tracker = new HermesStepsTracker();
    tracker.apply({ event: "tool.started", tool: "read_file", tool_call_id: "c1" });

    tracker.apply({ event: "tool.completed", tool: "read_file", error: true, tool_call_id: "c1" });

    expect(tracker.snapshot()[0]?.status).toBe("failed");
  });

  test("without a call id, a completion closes the latest running step of that tool", () => {
    const tracker = new HermesStepsTracker();
    tracker.apply({ event: "tool.started", tool: "web_search" });
    tracker.apply({ event: "tool.started", tool: "web_search" });

    tracker.apply({ event: "tool.completed", tool: "web_search" });

    expect(tracker.snapshot().map((step) => step.status)).toEqual(["running", "done"]);
  });

  test("reasoning becomes a finished thought with its text", () => {
    const tracker = new HermesStepsTracker();

    expect(tracker.apply({ event: "reasoning.available", text: "  Preciso ler a documentação.  " })).toBe(true);

    expect(tracker.snapshot()).toEqual([
      { id: "s0", kind: "thought", label: "Pensou", detail: "Preciso ler a documentação.", status: "done" },
    ]);
  });

  test("the result of a tool never enters the steps", () => {
    const tracker = new HermesStepsTracker();
    tracker.apply({ event: "tool.started", tool: "read_file", preview: ".env", tool_call_id: "c1" });

    tracker.apply({ event: "tool.completed", tool: "read_file", preview: "SECRET=abc", tool_call_id: "c1" });

    expect(JSON.stringify(tracker.snapshot())).not.toContain("SECRET");
  });

  test("other events change nothing, and finish closes steps left running", () => {
    const tracker = new HermesStepsTracker();
    expect(tracker.apply({ event: "message.delta" })).toBe(false);
    expect(tracker.apply({ event: "tool.started" })).toBe(false);
    expect(tracker.apply({ event: "reasoning.available", text: " " })).toBe(false);
    tracker.apply({ event: "tool.started", tool: "terminal", tool_call_id: "c1" });

    expect(tracker.finish()[0]?.status).toBe("done");
  });

  test("keeps only the latest 80 steps", () => {
    const tracker = new HermesStepsTracker();
    for (let index = 0; index < 90; index += 1) tracker.apply({ event: "reasoning.available", text: `p${index}` });

    const steps = tracker.snapshot();
    expect(steps).toHaveLength(80);
    expect(steps[0]?.detail).toBe("p10");
  });
});
