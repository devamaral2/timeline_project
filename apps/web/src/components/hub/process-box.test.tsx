import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import type { RequestDto } from "@repo/contracts";
import { expect, test, vi } from "vitest";
import { ProcessBox } from "./process-box";

const base: RequestDto = {
  id: "01HZY0000000000000000000AA", kind: "request", route: "steps", status: "running", title: "Criar duas tarefas",
  createdAt: "2026-11-14T12:00:00.000Z", updatedAt: "2026-11-14T12:00:01.000Z",
  steps: [
    { id: "1", agent: "task-create", label: "Criando tarefas", status: "done" },
    { id: "2", agent: "note-create", label: "Criando notas", status: "failed", errorCode: "internal" },
    { id: "3", agent: "task-create", label: "Criando tarefas", status: "running" },
    { id: "4", agent: "task-edit", label: "Editando tarefas", status: "queued" },
  ],
  entities: [],
};

test("titulo e passos com o estado de cada um, dito tambem para leitores de tela", () => {
  render(<ProcessBox request={base} />);
  expect(screen.getByText("Realizando processos:")).toBeTruthy();
  const steps = within(screen.getByRole("list", { name: "Passos do processo" })).getAllByRole("listitem");
  expect(steps.map((step) => step.textContent)).toEqual([
    "Criando tarefasconcluído", "Criando notasfalhou", "Criando tarefasem andamento", "Editando tarefasaguardando",
  ]);
  expect(steps.map((step) => step.getAttribute("data-status"))).toEqual(["succeeded", "failed", "running", "pending"]);
});

test("um passo cancelado diz cancelado", () => {
  render(<ProcessBox request={{ ...base, status: "cancel", steps: [{ id: "1", agent: "task-create", label: "Criando tarefas", status: "cancel" }] }} />);
  const step = within(screen.getByRole("list", { name: "Passos do processo" })).getByRole("listitem");
  expect(step.textContent).toBe("Criando tarefascancelado");
});

test("a resposta aparece so quando o pedido termina bem", () => {
  const { rerender } = render(<ProcessBox request={base} />);
  rerender(<ProcessBox request={{ ...base, status: "done", message: "Criei duas tarefas." }} />);
  expect(screen.getByText("Criei duas tarefas.")).toBeTruthy();
});

test("antes do primeiro estado da API, mostra o titulo e que o pedido esta sendo entendido", () => {
  render(<ProcessBox request={null} />);
  expect(screen.getByText("Realizando processos:")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Entendendo o pedido");
});

test("passo de consulta mostra as linhas devolvidas e avisa quando foram limitadas", () => {
  render(<ProcessBox request={{
    ...base, status: "done",
    steps: [{
      id: "q", agent: "query", label: "Consultando dados", status: "done",
      result: { columns: ["name", "started_at"], rows: [["Reunião", "2026-10-25T13:00:00.000Z"], ["Almoço", null]], truncated: true },
    }],
  }} />);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["name", "started_at"]);
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(screen.getByText("Mostrando só as primeiras linhas.")).toBeTruthy();
});

test("consulta sem linhas", () => {
  render(<ProcessBox request={{
    ...base, status: "done",
    steps: [{ id: "q", agent: "query", label: "Consultando dados", status: "done", result: { columns: ["n"], rows: [], truncated: false } }],
  }} />);
  expect(screen.getByText("Nenhum resultado.")).toBeTruthy();
});

test("cada registro criado ou alterado vira uma linha de prévia, com link quando há destino", () => {
  render(<ProcessBox
    request={{
      ...base, status: "done",
      entities: [
        { kind: "task", id: "e1", name: "Comprar faixa elástica", operation: "create", linkedTo: [] },
        { kind: "artifact", id: "a1", name: "Treino de mobilidade", artifactType: "text", operation: "update", linkedTo: [] },
      ],
    }}
    entityHref={(entity) => `/u/${entity.kind}/${entity.id}`}
  />);
  const rows = within(screen.getByRole("list", { name: "Registros desta resposta" })).getAllByRole("listitem");
  // Duas linhas por registro: o que aconteceu em cima, o nome embaixo. Artefato aparece como nota.
  expect(rows.map((row) => row.textContent)).toEqual(["Tarefa criadaComprar faixa elástica", "Nota alteradaTreino de mobilidade"]);
  expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe("/u/task/e1");
});

test("sem entidades, nenhuma lista de prévias", () => {
  render(<ProcessBox request={base} />);
  expect(screen.queryByRole("list", { name: "Registros desta resposta" })).toBeNull();
});

test("o botao de cancelar aparece so enquanto o pedido esta aberto e chama onCancel", () => {
  const onCancel = vi.fn();
  const { rerender } = render(<ProcessBox request={base} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
  expect(onCancel).toHaveBeenCalledTimes(1);

  rerender(<ProcessBox request={{ ...base, status: "done" }} onCancel={onCancel} />);
  expect(screen.queryByRole("button", { name: "Cancelar pedido" })).toBeNull();
});
