import { render, screen, within } from "@testing-library/react";
import type { RequestDto } from "@repo/contracts";
import type { ComponentProps } from "react";
import { expect, test } from "vitest";
import { ProcessAnswer } from "./process-answer";

const base: RequestDto = {
  id: "01HZY0000000000000000000AA", kind: "request", route: "steps", status: "running", title: "Criar duas tarefas",
  project: { id: "project-1", name: "personal", personal: true },
  createdAt: "2026-11-14T12:00:00.000Z", updatedAt: "2026-11-14T12:00:01.000Z",
  steps: [
    { id: "1", agent: "task-create", label: "Criando tarefas", status: "done" },
    { id: "2", agent: "task-create", label: "Criando tarefas", status: "running" },
  ],
  entities: [],
};

/** A resposta é um item da conversa: precisa da lista em volta. */
function renderAnswer(props: Omit<ComponentProps<typeof ProcessAnswer>, "name">) {
  return render(<ol><ProcessAnswer name="Assistente" {...props} /></ol>);
}

test("enquanto o pedido roda, a conversa não mostra nada dele: nem título, nem passos, nem cancelar", () => {
  const { rerender } = renderAnswer({ request: null });
  expect(screen.queryByRole("listitem")).toBeNull();

  rerender(<ol><ProcessAnswer name="Assistente" request={base} /></ol>);
  expect(screen.queryByRole("listitem")).toBeNull();
  expect(screen.queryByText("Criando tarefas")).toBeNull();
  expect(screen.queryByRole("button", { name: "Cancelar pedido" })).toBeNull();
});

test("a resposta aparece quando o pedido termina bem, sob o nome de quem responde e sem a lista de passos", () => {
  renderAnswer({ request: { ...base, status: "done", message: "Criei duas tarefas." } });
  expect(screen.getByText("Criei duas tarefas.")).toBeTruthy();
  expect(screen.getByText("Assistente")).toBeTruthy();
  expect(screen.queryByText("Realizando processos:")).toBeNull();
  expect(screen.queryByText("Criando tarefas")).toBeNull();
});

test("um pedido que falhou não deixa resposta: o aviso é a mensagem de erro da conversa", () => {
  renderAnswer({ request: { ...base, status: "failed", message: "Não deu.", errorCode: "internal" } });
  expect(screen.queryByRole("listitem")).toBeNull();
});

test("passo de consulta mostra as linhas devolvidas e avisa quando foram limitadas", () => {
  renderAnswer({ request: {
    ...base, status: "done",
    steps: [{
      id: "q", agent: "query", label: "Consultando dados", status: "done",
      result: { columns: ["name", "started_at"], rows: [["Reunião", "2026-10-25T13:00:00.000Z"], ["Almoço", null]], truncated: true },
    }],
  } });
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["name", "started_at"]);
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(screen.getByText("Mostrando só as primeiras linhas.")).toBeTruthy();
});

test("consulta sem linhas", () => {
  renderAnswer({ request: {
    ...base, status: "done",
    steps: [{ id: "q", agent: "query", label: "Consultando dados", status: "done", result: { columns: ["n"], rows: [], truncated: false } }],
  } });
  expect(screen.getByText("Nenhum resultado.")).toBeTruthy();
});

test("cada registro criado ou alterado vira uma linha de prévia, com link quando há destino", () => {
  renderAnswer({
    request: {
      ...base, status: "done",
      entities: [
        { kind: "task", id: "e1", name: "Comprar faixa elástica", operation: "create", linkedTo: [] },
        { kind: "artifact", id: "a1", name: "Treino de mobilidade", artifactType: "text", operation: "update", linkedTo: [] },
      ],
    },
    entityHref: (entity) => `/u/${entity.kind}/${entity.id}`,
  });
  const rows = within(screen.getByRole("list", { name: "Registros desta resposta" })).getAllByRole("listitem");
  // Duas linhas por registro: o que aconteceu em cima, o nome embaixo. Artefato aparece como nota.
  expect(rows.map((row) => row.textContent)).toEqual(["Tarefa criadaComprar faixa elástica", "Nota alteradaTreino de mobilidade"]);
  expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe("/u/task/e1");
});

test("o que um pedido cancelado gravou antes de parar continua à vista", () => {
  renderAnswer({ request: {
    ...base, status: "cancel",
    entities: [{ kind: "task", id: "e1", name: "Comprar faixa elástica", operation: "create", linkedTo: [] }],
  } });
  expect(within(screen.getByRole("list", { name: "Registros desta resposta" })).getAllByRole("listitem")).toHaveLength(1);
});

test("sem resposta, consulta nem registros, o pedido terminado não ocupa a conversa", () => {
  renderAnswer({ request: { ...base, status: "done" } });
  expect(screen.queryByRole("listitem")).toBeNull();
});
