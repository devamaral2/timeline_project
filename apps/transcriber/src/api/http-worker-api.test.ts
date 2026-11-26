import { describe, expect, it } from "vitest";
import { DeliveryTooLargeError, LeaseLostError, WorkerAuthError } from "../ports";
import { HttpWorkerApi } from "./http-worker-api";

interface Call {
  url: string;
  init: RequestInit;
}

function apiWith(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchFake = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { api: new HttpWorkerApi("https://gw.exemplo.com", "bdk_chave", fetchFake), calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("cliente HTTP do serviço local", () => {
  it("reserva o próximo pedido com a chave de dispositivo", async () => {
    const reservation = { requestId: "r", url: "u", leaseToken: "t", leaseExpiresAt: "2026-11-26T12:05:00Z" };
    const { api, calls } = apiWith(() => json(reservation));

    expect(await api.next()).toEqual(reservation);
    expect(calls[0]?.url).toBe("https://gw.exemplo.com/api/transcription-worker/next");
    expect(calls[0]?.init.method).toBe("POST");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe("Bearer bdk_chave");
  });

  it("204 é a fila vazia", async () => {
    const { api } = apiWith(() => new Response(null, { status: 204 }));
    expect(await api.next()).toBeNull();
  });

  it("renova o lease mandando o progresso", async () => {
    const { api, calls } = apiWith(() => json({ leaseExpiresAt: "2026-11-26T12:10:00Z" }));
    const input = { requestId: "r", leaseToken: "t", stage: "download" as const, percent: 10 };

    expect(await api.renew(input)).toEqual({ leaseExpiresAt: "2026-11-26T12:10:00Z" });
    expect(calls[0]?.url).toBe("https://gw.exemplo.com/api/transcription-worker/lease");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(input);
  });

  it("409 é o lease perdido, na renovação e na entrega", async () => {
    const { api } = apiWith(() => json({ message: "lease" }, 409));
    await expect(api.renew({ requestId: "r", leaseToken: "t", stage: "metadata", percent: 0 })).rejects.toBeInstanceOf(LeaseLostError);
    await expect(api.deliver({ requestId: "r", leaseToken: "t", outcome: "failed", code: "failed" })).rejects.toBeInstanceOf(LeaseLostError);
  });

  it("413 na entrega é o corpo grande demais para o gateway", async () => {
    const { api } = apiWith(() => json({}, 413));
    await expect(api.deliver({ requestId: "r", leaseToken: "t", outcome: "failed", code: "failed" })).rejects.toBeInstanceOf(DeliveryTooLargeError);
  });

  it.each([401, 403])("%i é a chave recusada", async (status) => {
    const { api } = apiWith(() => json({}, status));
    await expect(api.next()).rejects.toBeInstanceOf(WorkerAuthError);
  });

  it("outros erros HTTP viram erro comum, com o status e sem o corpo", async () => {
    const { api } = apiWith(() => new Response("<html>segredo interno</html>", { status: 502 }));
    await expect(api.next()).rejects.toThrow(/HTTP 502/);
    await expect(api.next()).rejects.not.toThrow(/segredo interno/);
  });

  it("entrega o resultado e devolve como a API ficou com o pedido", async () => {
    const { api } = apiWith(() => json({ requestId: "r", status: "failed", code: "too_large" }));
    expect(await api.deliver({ requestId: "r", leaseToken: "t", outcome: "failed", code: "too_large" })).toEqual({
      requestId: "r",
      status: "failed",
      code: "too_large",
    });
  });
});
