import { describe, expect, test, vi } from "vitest";
import { EntityBatchConflictError } from "../../domain";
import { retryDelay } from "../persistence/jobs/postgres-job.store";
import { completeCurrentJob, enqueueJobInTransaction, getCurrentJob, jobContext, type CurrentJob } from "./job-context";
import { RetryableJobError, isRetryableJobError, jobErrorCode } from "./jobs.service";

describe("classificacao de erros de job", () => {
  test("erros passageiros de rede e do provedor pedem nova tentativa", () => {
    expect(isRetryableJobError(new RetryableJobError("fora do ar"))).toBe(true);
    for (const status of [429, 500, 503, 599]) {
      expect(isRetryableJobError({ status }), String(status)).toBe(true);
      expect(isRetryableJobError({ statusCode: status }), String(status)).toBe(true);
      expect(isRetryableJobError({ response: { status } }), String(status)).toBe(true);
    }
    for (const code of ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"]) expect(isRetryableJobError({ code }), code).toBe(true);
    expect(isRetryableJobError({ name: "TimeoutError" })).toBe(true);
    expect(isRetryableJobError(new TypeError("fetch failed"))).toBe(true);
    // A causa embrulhada pelo SDK tambem conta.
    expect(isRetryableJobError(new Error("provider failed", { cause: { status: 503 } }))).toBe(true);
  });

  test("erros definitivos nao pedem nova tentativa", () => {
    expect(isRetryableJobError(new Error("invalid schema"))).toBe(false);
    expect(isRetryableJobError({ status: 401 })).toBe(false);
    expect(isRetryableJobError({ status: 404 })).toBe(false);
    expect(isRetryableJobError(new TypeError("x is not a function"))).toBe(false);
    expect(isRetryableJobError(undefined)).toBe(false);
    expect(isRetryableJobError("texto")).toBe(false);
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(isRetryableJobError(cyclic)).toBe(false);
  });

  test("o codigo gravado e sempre um dos codigos seguros, nunca a mensagem", () => {
    expect(jobErrorCode(new EntityBatchConflictError("dado privado"))).toBe("conflict");
    expect(jobErrorCode(Object.assign(new Error("dado privado"), { code: "invalid_input" }))).toBe("invalid_input");
    expect(jobErrorCode({ code: "limit_reached" })).toBe("limit_reached");
    expect(jobErrorCode(Object.assign(new Error("dado privado"), { code: "ECONNRESET" }))).toBe("unavailable");
    expect(jobErrorCode(new Error("chave sk-segredo"))).toBe("unavailable");
    expect(jobErrorCode("texto")).toBe("unavailable");
  });

  test("a espera do retry dobra a cada tentativa e para em um minuto", () => {
    expect([1, 2, 3, 4, 5].map(retryDelay)).toEqual([2000, 4000, 8000, 16000, 32000]);
    expect(retryDelay(6)).toBe(60000);
    expect(retryDelay(100)).toBe(60000);
  });
});

describe("contexto do job", () => {
  test("fora de um job, encerrar nao executa nada", async () => {
    const execute = vi.fn();

    await completeCurrentJob({ execute });

    expect(execute).not.toHaveBeenCalled();
    expect(getCurrentJob()).toBeUndefined();
  });

  test("dentro de um job, encerrar marca o contexto; sem a linha, o lease foi perdido", async () => {
    const current: CurrentJob = { id: "job-1", token: "token-1" };
    await jobContext.run(current, async () => {
      expect(getCurrentJob()).toBe(current);
      await expect(completeCurrentJob({ execute: vi.fn().mockResolvedValue({ rows: [] }) })).rejects.toThrow(/lease lost/);
      expect(current.completed).toBeUndefined();

      await completeCurrentJob({ execute: vi.fn().mockResolvedValue({ rows: [{ id: "job-1" }] }) });
    });

    expect(current.completed).toBe(true);
  });

  test("enfileirar exige dono e devolve o id que o banco gravou", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "ja-existia" }] });
    const input = { kind: "work", userId: "user-1", actorId: "user-1", payload: {} };

    expect(await enqueueJobInTransaction({ execute }, { ...input, dedupeKey: "chave" })).toBe("ja-existia");
    await expect(enqueueJobInTransaction({ execute }, { ...input, userId: "" })).rejects.toThrow(/authenticated ownership/);
    await expect(enqueueJobInTransaction({ execute }, { ...input, actorId: "" })).rejects.toThrow(/authenticated ownership/);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
