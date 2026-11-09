import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/authed-fetch";
import type { AiProcessDto } from "@/lib/api/contracts";
import { useEntityAiEdit } from "./use-entity-ai-edit";

const running: AiProcessDto = {
  id: "p1", status: "running", title: "Realizando processos:", entities: [],
  steps: [{ id: "s1", agent: "sleep-note-edit", label: "Editando a nota de sono", status: "running" }],
};
const done: AiProcessDto = {
  ...running, status: "completed",
  steps: [{ ...running.steps[0], status: "succeeded" }],
  entities: [{ kind: "note", id: "n1", name: "Sono", operation: "update", linkedTo: [] }],
};
const failed: AiProcessDto = {
  ...running, status: "failed",
  steps: [{ ...running.steps[0], status: "failed", errorCode: "nothing_to_change" }],
  message: "Não consegui concluir: editando a nota de sono.",
};

function setup(api: { startEdit: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> }) {
  const onEdited = vi.fn();
  const hook = renderHook(() => useEntityAiEdit({
    userId: "u", entityType: "sleep_note", entityId: "n1", onEdited, api, pollMs: 1,
  }));
  return { ...hook, onEdited };
}

beforeEach(() => vi.clearAllMocks());

test("envia o tipo e o id da entidade, acompanha o processo e avisa a tela uma vez ao concluir", async () => {
  const startEdit = vi.fn(async () => ({ processId: "p1" }));
  const get = vi.fn().mockResolvedValueOnce(running).mockResolvedValue(done);
  const { result, onEdited } = setup({ startEdit, get });

  let accepted = false;
  await act(async () => { accepted = await result.current.submit("  dormi 8h  "); });

  expect(accepted).toBe(true);
  expect(startEdit).toHaveBeenCalledWith({ userId: "u", text: "dormi 8h", entityType: "sleep_note", entityId: "n1" });
  expect(get).toHaveBeenCalledWith("p1");
  expect(result.current.phase).toBe("done");
  expect(result.current.process?.status).toBe("completed");
  expect(onEdited).toHaveBeenCalledTimes(1);
});

test("falha do processo mostra a mensagem do servidor e nao recarrega a tela", async () => {
  const { result, onEdited } = setup({ startEdit: vi.fn(async () => ({ processId: "p1" })), get: vi.fn(async () => failed) });
  await act(async () => { await result.current.submit("faz algo"); });
  expect(result.current.phase).toBe("failed");
  expect(result.current.error).toBe("Não consegui concluir: editando a nota de sono.");
  expect(onEdited).not.toHaveBeenCalled();
});

test.each([
  [403, /permissão/],
  [400, /ler esse pedido/],
  [404, /indisponível/],
  [500, /Algo deu errado/],
])("erro %s ao iniciar vira texto predefinido e devolve false", async (status, text) => {
  const { result } = setup({ startEdit: vi.fn(async () => { throw new ApiError(status, "x"); }), get: vi.fn() });
  let accepted = true;
  await act(async () => { accepted = await result.current.submit("pedido"); });
  expect(accepted).toBe(false);
  expect(result.current.phase).toBe("failed");
  expect(result.current.error).toMatch(text);
});

test("texto vazio nao envia, e so um pedido corre por vez", async () => {
  let release: (view: AiProcessDto) => void = () => {};
  const startEdit = vi.fn(async () => ({ processId: "p1" }));
  const get = vi.fn(() => new Promise<AiProcessDto>((resolve) => { release = resolve; }));
  const { result } = setup({ startEdit, get });

  await act(async () => { expect(await result.current.submit("   ")).toBe(false); });
  expect(startEdit).not.toHaveBeenCalled();

  let first: Promise<boolean> = Promise.resolve(false);
  act(() => { first = result.current.submit("um"); });
  await waitFor(() => expect(result.current.busy).toBe(true));
  await act(async () => { expect(await result.current.submit("dois")).toBe(false); });
  expect(startEdit).toHaveBeenCalledTimes(1);

  await act(async () => { release(done); await first; });
  expect(result.current.phase).toBe("done");
});

test("falhas seguidas ao acompanhar encerram o pedido sem recarregar", async () => {
  const get = vi.fn(async () => { throw new Error("rede"); });
  const { result, onEdited } = setup({ startEdit: vi.fn(async () => ({ processId: "p1" })), get });
  await act(async () => { await result.current.submit("pedido"); });
  expect(get).toHaveBeenCalledTimes(5);
  expect(result.current.phase).toBe("failed");
  expect(result.current.error).toMatch(/conexão/);
  expect(onEdited).not.toHaveBeenCalled();
});

test("dismiss volta ao inicio quando o pedido terminou", async () => {
  const { result } = setup({ startEdit: vi.fn(async () => ({ processId: "p1" })), get: vi.fn(async () => done) });
  await act(async () => { await result.current.submit("pedido"); });
  act(() => result.current.dismiss());
  expect(result.current).toMatchObject({ phase: "idle", process: null, error: null });
});
