import { expect, test } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import { isAutomationRouteOff, isHermesTurnTerminal, parseHermesCommand } from "./ai-automation";

test("so '/hermes <mensagem>' e um comando; o resto e pedido comum", () => {
  expect(parseHermesCommand("/hermes crie uma nota")).toBe("crie uma nota");
  expect(parseHermesCommand("  /HERMES   oi  ")).toBe("oi");
  expect(parseHermesCommand("/hermes\nlinha 1\nlinha 2")).toBe("linha 1\nlinha 2");
  expect(parseHermesCommand("/hermes")).toBeNull();
  expect(parseHermesCommand("/hermes   ")).toBeNull();
  expect(parseHermesCommand("/hermesx oi")).toBeNull();
  expect(parseHermesCommand("fale com o /hermes agora")).toBeNull();
});

test("404 significa rota desligada; outros erros nao", () => {
  expect(isAutomationRouteOff(new ApiError(404, "x"))).toBe(true);
  expect(isAutomationRouteOff(new ApiError(500, "x"))).toBe(false);
  expect(isAutomationRouteOff(new Error("x"))).toBe(false);
});

test("o job termina em sucesso, falha ou cancelamento", () => {
  expect(isHermesTurnTerminal({ status: "succeeded" })).toBe(true);
  expect(isHermesTurnTerminal({ status: "failed" })).toBe(true);
  expect(isHermesTurnTerminal({ status: "cancelled" })).toBe(true);
  expect(isHermesTurnTerminal({ status: "queued" })).toBe(false);
  expect(isHermesTurnTerminal({ status: "running" })).toBe(false);
});
