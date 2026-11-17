import { describe, expect, test } from "vitest";
import { toRequestDto } from "./request-view";
import { addStep, setupRequest } from "./testing/request-test-kit";

describe("passo de consulta", () => {
  test("uma unica consulta de leitura, sem segunda chamada ao modelo; as linhas ficam no passo", async () => {
    const ctx = setupRequest("o que tenho hoje?", {
      ok: true, columns: ["name", "started_at"], rows: [["Reunião", "2026-10-25T13:00:00Z"]], truncated: false,
    });
    const payload = await addStep(ctx, "s1", "query");
    ctx.gateway.outputs.set("query", { sql: "SELECT name, started_at FROM tasks LIMIT 20" });

    await ctx.queryWorker.run(payload);

    expect(ctx.gateway.calls).toHaveLength(1);
    expect(ctx.gateway.calls[0]?.user).toContain("Esquema:");
    expect(ctx.sql.calls).toEqual([{ userId: "user-1", sql: "SELECT name, started_at FROM tasks LIMIT 20" }]);
    expect(ctx.store.stepRecords[0]).toMatchObject({
      status: "done", result: { columns: ["name", "started_at"], rows: [["Reunião", "2026-10-25T13:00:00Z"]], truncated: false },
    });
    expect(ctx.store.jobs.at(-1)).toMatchObject({ kind: "request-finalize", stepId: "s1" });
    expect(ctx.batchWriter.commits).toHaveLength(0);

    const view = toRequestDto(ctx.store.require("r1"), ctx.store.stepRecords, []);
    expect(view.steps[0]).toMatchObject({ label: "Consultando dados", status: "done", result: { columns: ["name", "started_at"] } });
  });

  test("limita as linhas devolvidas", async () => {
    const rows = Array.from({ length: 80 }, (_, index) => [index]);
    const ctx = setupRequest("x", { ok: true, columns: ["n"], rows, truncated: false });
    const payload = await addStep(ctx, "s1", "query");
    ctx.gateway.outputs.set("query", { sql: "SELECT n FROM t" });
    await ctx.queryWorker.run(payload);
    expect(ctx.store.stepRecords[0]?.result).toMatchObject({ truncated: true });
    expect(ctx.store.stepRecords[0]?.result?.rows).toHaveLength(50);
  });

  test("consulta recusada pelo executor vira passo vermelho", async () => {
    const ctx = setupRequest("x", { ok: false, error: "so SELECT" });
    const payload = await addStep(ctx, "s1", "query");
    ctx.gateway.outputs.set("query", { sql: "DELETE FROM tasks" });
    await ctx.queryWorker.run(payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "query_rejected" });
  });
});
