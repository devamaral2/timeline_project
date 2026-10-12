import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnTimings } from "./turn-timings";

describe("TurnTimings", () => {
  afterEach(() => vi.restoreAllMocks());

  it("soma as chamadas de uma mesma etapa e inclui o total", async () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(0); // inicio do turno
    const timings = new TurnTimings();

    now.mockReturnValueOnce(10).mockReturnValueOnce(40); // 30 ms
    await timings.time("llm", async () => "a");
    now.mockReturnValueOnce(50).mockReturnValueOnce(70); // 20 ms
    await timings.time("llm", async () => "b");
    now.mockReturnValueOnce(80); // fim

    expect(timings.summary()).toEqual({ totalMs: 80, llmMs: 50 });
  });

  it("registra a etapa mesmo quando ela falha, e propaga o erro", async () => {
    const timings = new TurnTimings();

    await expect(timings.time("commit", async () => { throw new Error("conflito"); })).rejects.toThrow("conflito");

    expect(timings.summary()).toHaveProperty("commitMs");
  });
});
