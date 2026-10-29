import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { AiProcessDto } from "@/lib/api/contracts";
import { ProcessBox } from "./process-box";

const base: AiProcessDto = {
  id: "p", status: "running", title: "Realizando processos:", entities: [],
  steps: [
    { id: "1", agent: "event-create", label: "Criando eventos", status: "succeeded" },
    { id: "2", agent: "note-create", label: "Criando notas", status: "failed", errorCode: "agent_timeout" },
    { id: "3", agent: "task-create", label: "Criando tarefas", status: "running" },
    { id: "4", agent: "task-edit", label: "Editando tarefas", status: "pending" },
  ],
};

test("titulo e passos com o estado de cada um, dito tambem para leitores de tela", () => {
  render(<ProcessBox process={base} />);
  expect(screen.getByText("Realizando processos:")).toBeTruthy();
  const steps = within(screen.getByRole("list", { name: "Passos do processo" })).getAllByRole("listitem");
  expect(steps.map((step) => step.textContent)).toEqual([
    "Criando eventosconcluído", "Criando notasfalhou", "Criando tarefasem andamento", "Editando tarefasaguardando",
  ]);
  expect(steps.map((step) => step.getAttribute("data-status"))).toEqual(["succeeded", "failed", "running", "pending"]);
});

test("a mensagem do fim (o que falhou ou a resposta) aparece so quando existe", () => {
  const { rerender } = render(<ProcessBox process={base} />);
  expect(screen.queryByText("Criei o evento, mas não consegui criar a nota.")).toBeNull();
  rerender(<ProcessBox process={{ ...base, status: "completed", message: "Criei o evento, mas não consegui criar a nota." }} />);
  expect(screen.getByText("Criei o evento, mas não consegui criar a nota.")).toBeTruthy();
});

test("antes do primeiro estado do servidor, mostra o titulo e que o pedido esta sendo entendido", () => {
  render(<ProcessBox process={null} />);
  expect(screen.getByText("Realizando processos:")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Entendendo o pedido");
});

test("passo de consulta mostra as linhas devolvidas e avisa quando foram limitadas", () => {
  render(<ProcessBox process={{
    ...base, status: "completed",
    steps: [{
      id: "q", agent: "query", label: "Consultando dados", status: "succeeded",
      result: { columns: ["name", "started_at"], rows: [["Reunião", "2026-10-25T13:00:00.000Z"], ["Almoço", null]], truncated: true },
    }],
  }} />);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["name", "started_at"]);
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(screen.getByText("Mostrando só as primeiras linhas.")).toBeTruthy();
});

test("consulta sem linhas", () => {
  render(<ProcessBox process={{
    ...base, status: "completed",
    steps: [{ id: "q", agent: "query", label: "Consultando dados", status: "succeeded", result: { columns: ["n"], rows: [], truncated: false } }],
  }} />);
  expect(screen.getByText("Nenhum resultado.")).toBeTruthy();
});
