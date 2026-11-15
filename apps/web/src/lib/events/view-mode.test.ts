import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  VIEW_MODES,
  VIEW_MODE_STORAGE_KEY,
  readViewMode,
  useViewMode,
  viewModeOf,
  writeViewMode,
} from "./view-mode";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("há três modos fixos, com nome e executor de cada um", () => {
  expect(VIEW_MODES.map((mode) => [mode.id, mode.label, mode.actor])).toEqual([
    ["human", "Todos os seus eventos", "human"],
    ["agent", "Todos os eventos de agentes", "agent"],
    ["all", "Todos os eventos", undefined],
  ]);
});

test("cada modo aponta para a sua variável de cor, e as três são diferentes", () => {
  const colors = VIEW_MODES.map((mode) => mode.colorVar);
  expect(colors).toEqual(["--mode-human", "--mode-agent", "--mode-all"]);
});

test("sem escolha guardada, o modo é Todos os eventos", () => {
  expect(readViewMode()).toBe("all");
  expect(viewModeOf(null).id).toBe("all");
});

test("um valor guardado que não é um modo cai em Todos os eventos", () => {
  window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, "configurado");
  expect(readViewMode()).toBe("all");
});

test("a escolha gravada fica no navegador e volta na próxima leitura", () => {
  writeViewMode("agent");
  expect(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe("agent");
  expect(readViewMode()).toBe("agent");
});

test("o hook devolve o modo guardado e reage à troca na mesma aba", () => {
  writeViewMode("human");
  const { result } = renderHook(() => useViewMode());
  expect(result.current.id).toBe("human");

  act(() => writeViewMode("agent"));
  expect(result.current.id).toBe("agent");
  expect(result.current.actor).toBe("agent");
});

test("com o armazenamento bloqueado, a leitura vale Todos os eventos e a gravação não quebra", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("bloqueado");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("bloqueado");
  });

  expect(readViewMode()).toBe("all");
  expect(() => writeViewMode("human")).not.toThrow();
});
